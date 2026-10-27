import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import type { PaymentProvider } from "./types";

/**
 * Development gateway simulator. Its "gateway database" is a PlatformSetting row written only by the
 * mock checkout page, so verify() really is independent of what the webhook body says.
 * The registry refuses to use it when NODE_ENV is production.
 */
export const mockSecret = () => process.env.PAYMENT_WEBHOOK_SECRET || "dev-mock-webhook-secret";
export const signMock = (body: string) => createHmac("sha256", mockSecret()).update(body).digest("hex");

type Ledger = { status?: string; amountMinor?: number; currency?: string };

export const mockProvider: PaymentProvider = {
  name: "mock",

  async initialize(i) {
    return { authorizationUrl: `/dev/mock-pay/${i.paymentReference}` };
  },

  async verify(ref) {
    const row = await db.platformSetting.findUnique({ where: { key: `mockgw:${ref}` } });
    const v = row?.value as Ledger | null | undefined;
    if (!v) return { status: "pending", amountMinor: 0, currency: "", reference: ref };
    return {
      status: v.status === "success" ? "success" : "failed",
      amountMinor: v.amountMinor ?? 0,
      currency: v.currency ?? "",
      reference: ref,
    };
  },

  validateWebhook(raw, headers) {
    const given = Buffer.from(headers.get("x-mock-signature") ?? "");
    const expected = Buffer.from(signMock(raw));
    return given.length === expected.length && timingSafeEqual(given, expected);
  },

  parseWebhook(raw) {
    try {
      const j = JSON.parse(raw) as { id?: unknown; type?: unknown; reference?: unknown };
      if (typeof j.id !== "string") return null;
      return {
        eventId: j.id,
        type: j.type === "charge.success" ? "payment.succeeded" : j.type === "charge.failed" ? "payment.failed" : "other",
        reference: typeof j.reference === "string" ? j.reference : null,
      };
    } catch {
      return null;
    }
  },

  async refund() {
    return { ok: true };
  },
};
