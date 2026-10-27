"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { allow } from "@/lib/rate-limit";
import { PaymentConfigError } from "@/lib/payments/registry";
import { PaymentError, startPayment } from "@/lib/payments/service";

export async function payNow(_: unknown, form: FormData) {
  if (!(await allow("pay-now", 10, 600))) return { error: "Too many attempts. Please wait a few minutes." };
  const reference = z.string().regex(/^T9-[0-9A-Z]{10}$/).safeParse(form.get("reference"));
  if (!reference.success) return { error: "Invalid order." };
  let url: string;
  try {
    url = await startPayment(reference.data, process.env.APP_URL ?? "http://localhost:3000");
  } catch (e) {
    if (e instanceof PaymentError || e instanceof PaymentConfigError) return { error: e.message };
    console.error(e);
    return { error: "Something went wrong. Please try again." };
  }
  redirect(url);
}
