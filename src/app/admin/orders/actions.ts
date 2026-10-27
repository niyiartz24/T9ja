"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { after } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { enqueueTicketEmail, processOutbox } from "@/lib/outbox";
import { PaymentError, refundPayment } from "@/lib/payments/service";
import { PaymentConfigError } from "@/lib/payments/registry";

export async function refund(_: unknown, form: FormData): Promise<{ ok: boolean; message: string } | null> {
  const admin = await requireRole("SUPER_ADMIN");
  const id = z.string().min(1).safeParse(form.get("paymentId"));
  if (!id.success) return { ok: false, message: "Invalid payment." };
  try {
    await refundPayment(admin.id, id.data);
  } catch (e) {
    if (e instanceof PaymentError || e instanceof PaymentConfigError) return { ok: false, message: e.message };
    console.error(e);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
  revalidatePath("/admin/orders");
  return { ok: true, message: "Refunded." };
}

export async function resendTickets(_: unknown, form: FormData): Promise<{ ok: boolean; message: string } | null> {
  const admin = await requireRole("SUPER_ADMIN");
  const id = z.string().min(1).safeParse(form.get("orderId"));
  if (!id.success) return { ok: false, message: "Invalid order." };
  const order = await db.order.findUnique({ where: { id: id.data }, select: { id: true, status: true } });
  if (!order || order.status !== "PAID") return { ok: false, message: "Only paid orders have tickets to send." };
  await db.$transaction(async (tx) => {
    await enqueueTicketEmail(order.id, tx, { resend: true });
    await tx.auditLog.create({ data: { actorId: admin.id, action: "order.resend_tickets", entityType: "Order", entityId: order.id } });
  });
  after(() => processOutbox(5).catch((e) => console.error("outbox", e)));
  return { ok: true, message: "Ticket email queued." };
}
