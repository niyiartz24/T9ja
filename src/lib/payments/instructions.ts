import type { PaymentInstructions } from "./types";

/** Reads saved instructions back out of Payment.meta, rejecting anything malformed. */
export function instructionsOf(meta: unknown): PaymentInstructions | null {
  const i = (meta as { instructions?: Record<string, unknown> } | null | undefined)?.instructions;
  if (!i || i.kind !== "bank_transfer") return null;
  const { bankName, accountNumber, accountName, amountMinor } = i;
  if (typeof bankName !== "string" || typeof accountNumber !== "string" || typeof accountName !== "string" || typeof amountMinor !== "number") return null;
  return { kind: "bank_transfer", bankName, accountNumber, accountName, amountMinor, narration: typeof i.narration === "string" ? i.narration : undefined };
}
