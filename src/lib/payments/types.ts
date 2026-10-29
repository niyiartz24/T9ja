/**
 * The only surface the rest of the app uses to talk to a payment gateway.
 * To add another gateway: implement this interface in a new file and register it in registry.ts.
 */
export type InitInput = {
  paymentReference: string; // our unique reference, sent to the gateway
  orderReference: string;
  amountMinor: number;
  currency: string;
  buyerName: string;
  buyerEmail: string;
  callbackUrl: string; // where a redirect-style gateway sends the customer back to
};

/** What the customer must do when the gateway has no hosted page (for example a bank transfer). */
export type PaymentInstructions = {
  kind: "bank_transfer";
  bankName: string;
  accountNumber: string;
  accountName: string;
  amountMinor: number;
};

export type InitResult = {
  authorizationUrl?: string; // redirect-style gateways
  instructions?: PaymentInstructions; // bank-transfer style gateways
  meta?: Record<string, unknown>; // gateway data we must keep (for example its own reference)
};

export type VerifyResult = {
  status: "success" | "failed" | "pending";
  amountMinor: number;
  currency: string;
  reference: string; // the reference the gateway reports; must equal ours
};

export type WebhookEvent = {
  eventId: string; // unique per gateway event (idempotency key)
  type: "payment.succeeded" | "payment.failed" | "other";
  reference: string | null;
};

export interface PaymentProvider {
  readonly name: string;
  initialize(input: InitInput): Promise<InitResult>;
  /** Must ask the gateway itself. Never trust anything the customer's browser or a webhook body claims. */
  verify(providerReference: string, meta?: unknown): Promise<VerifyResult>;
  /** Constant-time signature check over the RAW request body. */
  validateWebhook(rawBody: string, headers: Headers): boolean;
  parseWebhook(rawBody: string): WebhookEvent | null;
  refund?(input: { providerReference: string; amountMinor: number }): Promise<{ ok: boolean }>;
}
