"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { allow } from "@/lib/rate-limit";
import { processOutbox } from "@/lib/outbox";
import { claimTransfer } from "@/lib/payments/manual-service";
import { PaymentError } from "@/lib/payments/service";

const schema = z.object({
  reference: z.string().regex(/^T9-[0-9A-Z]{10}$/),
  senderName: z.string().trim().min(2, "Enter the name on the account you paid from").max(100),
  note: z.string().trim().max(300).default(""),
});

export async function reportTransfer(_: unknown, form: FormData): Promise<{ error?: string }> {
  if (!(await allow("claim-transfer", 10, 600))) return { error: "Too many attempts. Please wait a few minutes." };
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await claimTransfer(parsed.data.reference, parsed.data.senderName, parsed.data.note);
  } catch (e) {
    if (e instanceof PaymentError) return { error: e.message };
    console.error(e);
    return { error: "Something went wrong. Please try again." };
  }
  after(() => processOutbox(3).catch((e) => console.error("outbox", e)));
  revalidatePath(`/orders/${parsed.data.reference}`);
  return {};
}
