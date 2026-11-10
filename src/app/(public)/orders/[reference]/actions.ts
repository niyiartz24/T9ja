"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { allow } from "@/lib/rate-limit";
import { PaymentConfigError } from "@/lib/payments/registry";
import { PaymentError, startPayment } from "@/lib/payments/service";

const schema = z.object({
  reference: z.string().regex(/^T9-[0-9A-Z]{10}$/),
  provider: z.string().max(30).optional(),
  fresh: z.string().optional(),
});

export async function payNow(_: unknown, form: FormData): Promise<{ error?: string }> {
  if (!(await allow("pay-now", 10, 600))) return { error: "Too many attempts. Please wait a few minutes." };
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Invalid order." };
  let url: string | null;
  try {
    url = (await startPayment(parsed.data.reference, process.env.APP_URL ?? "http://localhost:3000", { provider: parsed.data.provider || undefined, fresh: parsed.data.fresh === "1" })).authorizationUrl;
  } catch (e) {
    if (e instanceof PaymentError || e instanceof PaymentConfigError) return { error: e.message };
    console.error(e);
    return { error: "Something went wrong. Please try again." };
  }
  if (url) redirect(url);
  revalidatePath(`/orders/${parsed.data.reference}`); // bank-transfer methods: the page now shows the account details
  return {};
}
