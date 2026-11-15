import { manualProvider } from "./manual";
import { mockProvider } from "./mock";
import { korapayProvider } from "./korapay";
import type { PaymentProvider } from "./types";

export class PaymentConfigError extends Error {}

// To add another gateway: implement PaymentProvider in a new file and register it here.
const providers: Record<string, PaymentProvider> = { korapay: korapayProvider, manual: manualProvider, mock: mockProvider };

/**
 * Methods customers can choose, in the order of PAYMENT_PROVIDERS (for example "korapay,manual").
 * The older single PAYMENT_PROVIDER still works. Unknown names, the mock provider in production,
 * and providers whose settings are incomplete are left out.
 */
export function enabledProviders(): PaymentProvider[] {
  const raw: string = process.env.PAYMENT_PROVIDERS ?? process.env.PAYMENT_PROVIDER ?? "";
  const names: string[] = [...new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean))];
  return names.flatMap((n) => {
    const p = providers[n];
    if (!p) return [];
    if (n === "mock" && process.env.NODE_ENV === "production") return [];
    if (p.isConfigured && !p.isConfigured()) return [];
    return [p];
  });
}

export const enabledProviderNames = () => enabledProviders().map((p) => p.name);

/** A registered provider by name (webhooks and verification), or the first enabled one. */
export function getProvider(name?: string): PaymentProvider {
  const n = (name ?? "").trim().toLowerCase();
  if (!n) {
    const first = enabledProviders()[0];
    if (!first) throw new PaymentConfigError("Online payment is not configured yet.");
    return first;
  }
  if (n === "mock" && process.env.NODE_ENV === "production") {
    throw new PaymentConfigError("The mock payment provider cannot be used in production.");
  }
  const p = providers[n];
  if (!p) throw new PaymentConfigError(`Unknown payment provider "${n}".`);
  return p;
}
