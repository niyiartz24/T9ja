import type { PaymentProvider } from "./types";

/** Ticket9ja's receiving account. Not secret; override with MANUAL_BANK_* in .env if it ever changes. */
export function bankDetails() {
  return {
    bankName: process.env.MANUAL_BANK_NAME || "VFD MFB",
    accountNumber: process.env.MANUAL_BANK_ACCOUNT_NUMBER || "1048926078",
    accountName: process.env.MANUAL_BANK_ACCOUNT_NAME || "Ticket9ja",
  };
}

type Confirmation = { status?: string; amountMinor?: number; currency?: string };

/**
 * Manual bank transfer. There is no gateway: the "source of truth" is the Super Admin, who compares the
 * customer's transfer with the bank statement and records a confirmation on the payment (meta.confirmation).
 * Only the admin-only server actions write it, so customers and webhooks can never self-confirm.
 * The shared finalizePayment() still checks the recorded amount and currency against the order.
 */
export const manualProvider: PaymentProvider = {
  name: "manual",

  async initialize(i) {
    return { instructions: { kind: "bank_transfer", ...bankDetails(), amountMinor: i.amountMinor, narration: i.orderReference } };
  },

  async verify(ref, meta) {
    const c = (meta as { confirmation?: Confirmation } | null | undefined)?.confirmation;
    if (!c) return { status: "pending", amountMinor: 0, currency: "", reference: ref };
    return { status: c.status === "success" ? "success" : "failed", amountMinor: c.amountMinor ?? 0, currency: c.currency ?? "", reference: ref };
  },

  validateWebhook() { return false; }, // no gateway, so nothing is ever accepted as a webhook
  parseWebhook() { return null; },

  /** The admin sends the money back from the bank first, then records it with the Refund button. */
  async refund() { return { ok: true }; },
};
