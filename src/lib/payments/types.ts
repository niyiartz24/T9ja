/**
 * The only surface the rest of the app uses to talk to a payment gateway.
 * To add the client's real gateway: implement this interface in a new file and register it in registry.ts.
 */
export type InitInput = {
  paymentReference: string; // our unique reference, sent to the gateway
  orderReference: string;
  amountMinor: number;
  currency: string;
  buyerEmail: string;
  callbackUrl: string; // where the gateway sends the customer back to
};

export type VerifyResult = {
  status: "success" | "failed" | "pending";
  amountMinor: number;
  currency: string;
  reference: string; // the reference the gateway reports; must equal ours
};

export type WebhookEvent = {
  eventId: string; // gateway's unique event id (idempotency key)
  type: "payment.succeeded" | "payment.failed" | "other";
  reference: string | null;
};

export interface PaymentProvider {
  readonly name: string;
  initialize(input: InitInput): Promise<{ authorizationUrl: string }>;
  /** Must ask the gateway itself. Never trust anything the customer's browser or a webhook body claims. */
  verify(providerReference: string): Promise<VerifyResult>;
  /** Constant-time signature check over the RAW request body. */
  validateWebhook(rawBody: string, headers: Headers): boolean;
  parseWebhook(rawBody: string): WebhookEvent | null;
  refund?(input: { providerReference: string; amountMinor: number }): Promise<{ ok: boolean }>;
}
