"use server";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { processOutbox } from "@/lib/outbox";
import { z } from "zod";
import { allow } from "@/lib/rate-limit";
import { checkout } from "@/lib/checkout";
import { InventoryError } from "@/lib/inventory";

const schema = z.object({
  eventId: z.string().min(1),
  name: z.string().trim().min(2, "Enter your full name").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
});

export async function startCheckout(_: unknown, form: FormData) {
  if (!(await allow("checkout", 10, 600))) return { error: "Too many attempts. Please wait a few minutes and try again." };
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Only ticket-type ids and quantities are read from the client. Prices are never accepted.
  const lines = [...form.entries()]
    .filter(([k]) => k.startsWith("qty_"))
    .map(([k, v]) => ({ ticketTypeId: k.slice(4), quantity: Number(v) }))
    .filter((l) => l.quantity !== 0);
  if (lines.length === 0) return { error: "Select at least one ticket." };

  let reference: string;
  try {
    ({ reference } = await checkout({ eventId: parsed.data.eventId, buyerName: parsed.data.name, buyerEmail: parsed.data.email, lines }));
  } catch (e) {
    if (e instanceof InventoryError) return { error: e.message };
    console.error("checkout failed", e);
    return { error: "Something went wrong. Please try again." };
  }
  after(() => processOutbox(5).catch((e) => console.error("outbox", e)));
  redirect(`/orders/${reference}`);
}
