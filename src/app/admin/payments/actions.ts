"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { parseMajorToMinor } from "@/lib/money";
import { processOutbox } from "@/lib/outbox";
import { PaymentError, type Outcome } from "@/lib/payments/service";
import { confirmManualPayment, rejectManualPayment } from "@/lib/payments/manual-service";

type State = { ok: boolean; message: string } | null;

const MESSAGE: Record<Outcome, { ok: boolean; message: string }> = {
  issued: { ok: true, message: "Confirmed. Tickets issued and emailed." },
  already: { ok: true, message: "Already handled." },
  pending: { ok: false, message: "Nothing was recorded. Try again." },
  failed: { ok: true, message: "Marked as not received." },
  review: { ok: false, message: "The amount you entered does not match the order. It was sent to review and no tickets were issued." },
  refund_required: { ok: false, message: "Recorded, but this order can no longer be fulfilled (it was already paid, cancelled or the stock is gone). A refund is needed." },
};

function fail(e: unknown): State {
  if (e instanceof PaymentError) return { ok: false, message: e.message };
  console.error(e);
  return { ok: false, message: "Something went wrong. Please try again." };
}

export async function confirmPayment(_: State, form: FormData): Promise<State> {
  const admin = await requireRole("SUPER_ADMIN");
  const parsed = z.object({ paymentId: z.string().min(1), amount: z.string() }).safeParse(Object.fromEntries(form));
  const minor = parsed.success ? parseMajorToMinor(parsed.data.amount) : null;
  if (!parsed.success || minor === null) return { ok: false, message: "Enter the amount received, like 5000 or 5000.00." };
  try {
    const outcome = await confirmManualPayment(admin.id, parsed.data.paymentId, minor);
    after(() => processOutbox(5).catch((e) => console.error("outbox", e)));
    revalidatePath("/admin/payments");
    revalidatePath("/admin/orders");
    return MESSAGE[outcome];
  } catch (e) {
    return fail(e);
  }
}

export async function rejectPayment(_: State, form: FormData): Promise<State> {
  const admin = await requireRole("SUPER_ADMIN");
  const id = z.string().min(1).safeParse(form.get("paymentId"));
  if (!id.success) return { ok: false, message: "Invalid payment." };
  try {
    const outcome = await rejectManualPayment(admin.id, id.data);
    revalidatePath("/admin/payments");
    return MESSAGE[outcome];
  } catch (e) {
    return fail(e);
  }
}
