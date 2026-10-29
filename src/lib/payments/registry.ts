import { mockProvider } from "./mock";
import { payonusProvider } from "./payonus";
import type { PaymentProvider } from "./types";

export class PaymentConfigError extends Error {}

const providers: Record<string, PaymentProvider> = { mock: mockProvider, payonus: payonusProvider };

export function getProvider(name?: string): PaymentProvider {
  const n = (name ?? process.env.PAYMENT_PROVIDER ?? "").trim().toLowerCase();
  if (!n) throw new PaymentConfigError("Online payment is not configured yet.");
  if (n === "mock" && process.env.NODE_ENV === "production") {
    throw new PaymentConfigError("The mock payment provider cannot be used in production.");
  }
  const p = providers[n];
  if (!p) throw new PaymentConfigError(`Unknown payment provider "${n}".`);
  return p;
}
