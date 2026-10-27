"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { allow } from "@/lib/rate-limit";

const schema = z.object({
  reference: z.string().trim().toUpperCase().regex(/^T9-[0-9A-Z]{10}$/),
  email: z.string().trim().toLowerCase().email().max(254),
});

export async function lookupOrder(_: unknown, form: FormData) {
  if (!(await allow("order-lookup", 10, 600))) return { error: "Too many attempts. Please wait a few minutes and try again." };
  const generic = { error: "We could not find an order with those details." };
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return generic;
  const order = await db.order.findFirst({
    where: { reference: parsed.data.reference, buyerEmail: parsed.data.email },
    select: { reference: true },
  });
  if (!order) return generic;
  redirect(`/orders/${order.reference}`);
}
