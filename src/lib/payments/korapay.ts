import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentProvider, VerifyResult } from "./types";

/**
 * Korapay (Kora) Checkout Redirect adapter.
 * Docs: https://developers.korapay.com/docs/checkout-redirect and /docs/webhooks
 *
 * - Test or live is decided by the secret key (sk_test_... or sk_live_...), not by a different URL.
 * - Korapay amounts are naira with decimals; ours are integer kobo.
 * - A webhook only triggers verification. Tickets are issued from verify(), which asks the Korapay API
 *   for the charge by OUR reference and compares the amount actually paid.
 */
const BASE = "https://api.korapay.com/merchant/api/v1";

const secret = () => {
  const v = process.env.KORAPAY_SECRET_KEY;
  if (!v) throw new Error("Missing environment variable KORAPAY_SECRET_KEY");
  return v;
};

export const nairaToKobo = (n: number) => Math.round(n * 100);
export const koboToNaira = (k: number) => Number((k / 100).toFixed(2));

/**
 * Only "success" counts as paid. Everything else stays pending ON PURPOSE: a customer can retry inside the same
 * Korapay checkout after a failed attempt, so a "failed" status is not final and must never close the payment.
 */
export function mapKoraStatus(s: string | undefined | null): "success" | "pending" {
  return (s ?? "").toLowerCase() === "success" ? "success" : "pending";
}

/** x-korapay-signature is the hex HMAC SHA256 of JSON.stringify(data) (the data object only), signed with the secret key. */
export function korapaySignatureMatches(data: unknown, secretKey: string, header: string | null): boolean {
  if (!header || !secretKey || data === undefined) return false;
  const expected = Buffer.from(createHmac("sha256", secretKey).update(JSON.stringify(data)).digest("hex"));
  const given = Buffer.from(header.trim().toLowerCase());
  return expected.length === given.length && timingSafeEqual(expected, given);
}

type Charge = { status?: string; amount?: number | string; amount_paid?: number | string | null; currency?: string; reference?: string };

export const korapayProvider: PaymentProvider = {
  name: "korapay",
  label: "Pay with card or bank (Korapay)",
  description: "Pay securely with your card, bank transfer or Pay with Bank. Your tickets are confirmed automatically.",

  isConfigured() {
    return !!process.env.KORAPAY_SECRET_KEY;
  },

  async initialize(i) {
    const appUrl = process.env.APP_URL ?? "";
    const publicHttps = /^https:\/\//.test(appUrl) && !/localhost|127\.0\.0\.1/.test(appUrl);
    const res = await fetch(`${BASE}/charges/initialize`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret()}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        amount: koboToNaira(i.amountMinor),
        currency: i.currency,
        reference: i.paymentReference,
        redirect_url: i.callbackUrl, // Korapay appends ?reference=... when the customer comes back
        narration: `Ticket9ja order ${i.orderReference}`,
        customer: { name: i.buyerName, email: i.buyerEmail },
        merchant_bears_cost: true, // the customer pays exactly the ticket price, so the amount we verify is exact
        metadata: { order: i.orderReference },
        // Only set a per-payment webhook URL when this app is publicly reachable over HTTPS.
        ...(publicHttps ? { notification_url: `${appUrl.replace(/\/+$/, "")}/api/webhooks/payments/korapay` } : {}),
      }),
    });
    if (!res.ok) throw new Error(`Korapay could not start the payment (HTTP ${res.status}): ${(await res.text().catch(() => "")).slice(0, 300)}`);
    const body = (await res.json()) as { status?: boolean; data?: { checkout_url?: string } };
    const url = body.data?.checkout_url;
    if (!body.status || !url) throw new Error("Korapay returned no checkout link");
    // We are about to send a customer there: only ever to a Korapay address.
    let host = "";
    try { host = new URL(url).hostname; } catch { /* rejected below */ }
    if (!/(^|\.)korapay\.com$/.test(host)) throw new Error("Korapay returned an unexpected checkout address");
    return { authorizationUrl: url };
  },

  async verify(ref): Promise<VerifyResult> {
    const pending: VerifyResult = { status: "pending", amountMinor: 0, currency: "", reference: ref };
    const res = await fetch(`${BASE}/charges/${encodeURIComponent(ref)}`, {
      headers: { Authorization: `Bearer ${secret()}`, Accept: "application/json" },
    });
    if (res.status === 404) return pending; // the customer has not opened checkout yet
    if (!res.ok) throw new Error(`Korapay verification failed (HTTP ${res.status})`);
    const d = ((await res.json()) as { data?: Charge }).data;
    if (!d) return pending;
    const status = mapKoraStatus(d.status);
    if (status === "pending") return pending;
    // amount_paid is what actually arrived (bank transfers can be under- or over-paid); fall back to amount only if absent.
    const paid = Number(d.amount_paid ?? d.amount ?? 0);
    return { status: "success", amountMinor: Number.isFinite(paid) ? nairaToKobo(paid) : 0, currency: d.currency ?? "", reference: d.reference ?? ref };
  },

  validateWebhook(raw, headers) {
    try {
      const key = process.env.KORAPAY_SECRET_KEY;
      if (!key) return false;
      return korapaySignatureMatches((JSON.parse(raw) as { data?: unknown }).data, key, headers.get("x-korapay-signature"));
    } catch {
      return false;
    }
  },

  parseWebhook(raw) {
    try {
      const j = JSON.parse(raw) as { event?: unknown; data?: { reference?: unknown; status?: unknown } };
      const reference = j.data?.reference;
      if (typeof j.event !== "string" || typeof reference !== "string") return null;
      const status = String(j.data?.status);
      return {
        eventId: `${j.event}:${reference}:${status}`, // Korapay sends no event id; this is unique per outcome
        type: j.event === "charge.success" && status === "success" ? "payment.succeeded" : "other", // failures are not final, see mapKoraStatus
        reference,
      };
    } catch {
      return null;
    }
  },

  /** Refund from the Korapay dashboard first, then record it here with the Refund button. */
  async refund() { return { ok: true }; },
};
