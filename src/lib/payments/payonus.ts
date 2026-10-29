import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import type { PaymentProvider, VerifyResult } from "./types";

/**
 * PayOnUs adapter using Dynamic Accounts (a temporary bank account per order).
 * Docs: https://documentation.payonus.com  (API Integration, Dynamic Accounts, Verify Payment, Webhooks)
 *
 * Money is NGN in naira with decimals on their side and integer kobo on ours.
 * The webhook signature does not cover the amount or our reference, so a webhook only ever
 * triggers verification: tickets are issued from verify(), which asks the PayOnUs API.
 */
const need = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
};

const env = () => ((process.env.PAYONUS_ENV ?? "sandbox").toLowerCase() === "production" ? "production" : "sandbox");
const baseUrl = () => (env() === "production" ? "https://core.payonus.com" : "https://core-sandbox.payonus.com");
const tokenKey = () => `payonus:token:${env()}`;

/**
 * PayOnUs allows ONE valid access token at a time and 3 token requests per minute, and every new token
 * invalidates the previous one. So the token is cached in the database (shared by all server instances),
 * and refreshed only when it is missing, near expiry, or was just rejected with 401.
 */
async function accessToken(rejected?: string): Promise<string> {
  const row = await db.platformSetting.findUnique({ where: { key: tokenKey() } });
  const cached = row?.value as { token?: string; expiresAt?: number } | null | undefined;
  if (cached?.token && (cached.expiresAt ?? 0) > Date.now() + 60_000 && cached.token !== rejected) return cached.token;

  const res = await fetch(`${baseUrl()}/api/v1/access-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ apiClientId: need("PAYONUS_CLIENT_ID"), apiClientSecret: need("PAYONUS_CLIENT_SECRET") }),
  });
  if (!res.ok) throw new Error(`PayOnUs authentication failed (HTTP ${res.status})`);
  const body = (await res.json()) as { access_token?: string; expires_in?: number; data?: { access_token?: string; expires_in?: number } };
  const token = body.access_token ?? body.data?.access_token;
  if (!token) throw new Error("PayOnUs authentication returned no token");
  const ttl = body.expires_in ?? body.data?.expires_in ?? 3600;
  const value = { token, expiresAt: Date.now() + Math.max(60, ttl - 300) * 1000 };
  await db.platformSetting.upsert({ where: { key: tokenKey() }, create: { key: tokenKey(), value }, update: { value } });
  return token;
}

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const call = (token: string) =>
    fetch(`${baseUrl()}${path}`, {
      ...init,
      headers: { Accept: "application/json", "Content-Type": "application/json", ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
    });
  const first = await accessToken();
  const res = await call(first);
  if (res.status !== 401) return res;
  return call(await accessToken(first)); // token was replaced elsewhere: use the newer one, or mint a fresh one
}

type PaymentRequest = {
  paymentStatus?: string; amount?: number; amountPaid?: number | null; currency?: string;
  merchantReference?: string | null; onusReference?: string | null;
};

/** PayOnUs statuses are PROCESSING, PENDING, SUCCESSFUL and FAILED. Anything unknown stays pending. */
export function mapPayonusStatus(s: string | undefined | null): "success" | "failed" | "pending" {
  const v = (s ?? "").toUpperCase();
  return v === "SUCCESSFUL" ? "success" : v === "FAILED" ? "failed" : "pending";
}

export const nairaToKobo = (n: number) => Math.round(n * 100);
export const koboToNaira = (k: number) => Number((k / 100).toFixed(2));

/** sha256(accountNumber + onusReference + paymentStatus + verificationKey), compared to the "hash" header. */
export function payonusHashMatches(body: { accountNumber?: unknown; onusReference?: unknown; paymentStatus?: unknown }, key: string, header: string | null): boolean {
  if (!header || !key) return false;
  const given = Buffer.from(header.trim().toLowerCase());
  const variants = [
    [body.accountNumber ?? "", body.onusReference ?? "", body.paymentStatus ?? ""],
    [String(body.accountNumber), String(body.onusReference), String(body.paymentStatus)], // in case a field arrives null
  ];
  return variants.some((parts) => {
    const expected = Buffer.from(createHash("sha256").update(parts.join("") + key).digest("hex"));
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
}

export const payonusProvider: PaymentProvider = {
  name: "payonus",

  async initialize(i) {
    const appUrl = process.env.APP_URL ?? "";
    const publicHttps = /^https:\/\//.test(appUrl) && !/localhost|127\.0\.0\.1/.test(appUrl);
    const res = await api("/api/v1/virtual-accounts/dynamic", {
      method: "POST",
      body: JSON.stringify({
        amount: koboToNaira(i.amountMinor),
        reference: i.paymentReference,
        businessId: need("PAYONUS_BUSINESS_ID"),
        customer: { name: i.buyerName, email: i.buyerEmail, phone: "+2347000000000", externalId: i.orderReference }, // phone is required by PayOnUs; we do not collect one
        // Only override the dashboard webhook URL when this app is publicly reachable over HTTPS.
        ...(publicHttps ? { notificationUrl: `${appUrl.replace(/\/+$/, "")}/api/webhooks/payments/payonus` } : {}),
      }),
    });
    if (!res.ok) throw new Error(`PayOnUs could not create the account (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { data?: { accountName?: string; accountNumber?: string; bankName?: string; onusReference?: string } };
    const d = body.data;
    if (!d?.accountNumber || !d.bankName || !d.onusReference) throw new Error("PayOnUs returned incomplete account details");
    return {
      instructions: { kind: "bank_transfer", bankName: d.bankName, accountNumber: d.accountNumber, accountName: d.accountName ?? "Ticket9ja", amountMinor: i.amountMinor },
      meta: { onusReference: d.onusReference },
    };
  },

  async verify(ref, meta): Promise<VerifyResult> {
    const businessId = need("PAYONUS_BUSINESS_ID");
    const onusReference = (meta as { onusReference?: string } | null | undefined)?.onusReference;
    let item: PaymentRequest | undefined;

    if (onusReference) {
      const res = await api(`/api/v1/payment-requests/businesses/${encodeURIComponent(businessId)}?onusReference=${encodeURIComponent(onusReference)}`);
      if (res.status === 404) return { status: "pending", amountMinor: 0, currency: "", reference: ref };
      if (!res.ok) throw new Error(`PayOnUs verification failed (HTTP ${res.status})`);
      item = ((await res.json()) as { data?: PaymentRequest }).data;
    } else {
      const res = await api(`/api/v1/payment-requests?businessId=${encodeURIComponent(businessId)}&reference=${encodeURIComponent(ref)}&page=0&size=5`);
      if (!res.ok) throw new Error(`PayOnUs search failed (HTTP ${res.status})`);
      const list = ((await res.json()) as { data?: { content?: PaymentRequest[] } }).data?.content ?? [];
      item = list.find((r) => r.merchantReference === ref);
    }
    if (!item) return { status: "pending", amountMinor: 0, currency: "", reference: ref };
    return {
      status: mapPayonusStatus(item.paymentStatus),
      amountMinor: nairaToKobo(Number(item.amountPaid ?? 0)), // what was actually received, not what was requested
      currency: item.currency ?? "",
      reference: item.merchantReference ?? ref,
    };
  },

  validateWebhook(raw, headers) {
    try {
      const key = process.env.PAYONUS_WEBHOOK_KEY;
      if (!key) return false;
      return payonusHashMatches(JSON.parse(raw), key, headers.get("hash"));
    } catch {
      return false;
    }
  },

  parseWebhook(raw) {
    try {
      const j = JSON.parse(raw) as { id?: unknown; type?: unknown; paymentStatus?: unknown; onusReference?: unknown; merchantReference?: unknown };
      if (typeof j.id !== "string" || typeof j.onusReference !== "string") return null;
      const status = mapPayonusStatus(typeof j.paymentStatus === "string" ? j.paymentStatus : "");
      const collection = j.type === "COLLECTION";
      return {
        eventId: `${j.id}:${j.onusReference}:${String(j.paymentStatus)}`,
        type: collection && status === "success" ? "payment.succeeded" : collection && status === "failed" ? "payment.failed" : "other",
        reference: typeof j.merchantReference === "string" ? j.merchantReference : null,
      };
    } catch {
      return null;
    }
  },
  // No refund(): PayOnUs documents bank-transfer refunds separately. Refund from the PayOnUs dashboard for now.
};
