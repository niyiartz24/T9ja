import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { enqueueEmail } from "@/lib/outbox";
import { PaymentError, finalizePayment, type Outcome } from "./service";

const HOLD_MS = 24 * 3600_000; // stock is held this long once a customer reports a transfer
const OPEN = ["INITIATED", "PENDING"] as const;

const asObject = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Customer says "I have paid". Holds the stock while the admin checks the bank statement and alerts the admin. */
export async function claimTransfer(orderReference: string, senderName: string, note: string) {
  const order = await db.order.findUnique({
    where: { reference: orderReference },
    include: { event: { select: { title: true } }, payments: { where: { provider: "manual", status: { in: [...OPEN] } }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!order || order.status !== "PENDING") throw new PaymentError("This order can no longer be paid.");
  const payment = order.payments[0];
  if (!payment) throw new PaymentError("Choose bank transfer first, then tell us once you have paid.");
  if (payment.claimedAt) return; // already reported: nothing to do

  const alertTo = process.env.PAYMENT_ALERT_EMAIL?.trim();
  await db.$transaction(async (tx) => {
    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, claimedAt: null, status: { in: [...OPEN] } },
      data: { claimedAt: new Date(), meta: { ...asObject(payment.meta), claim: { senderName, note, at: new Date().toISOString() } } as Prisma.InputJsonValue },
    });
    if (claimed.count !== 1) return;
    await tx.order.updateMany({
      where: { id: order.id, status: "PENDING", createdAt: { gt: new Date(Date.now() - 3 * 24 * 3600_000) } },
      data: { expiresAt: new Date(Date.now() + HOLD_MS) },
    });
    await tx.auditLog.create({ data: { action: "payment.claimed", entityType: "Payment", entityId: payment.id } });
    if (alertTo) {
      await enqueueEmail(tx, {
        to: alertTo, template: "payment-claim", dedupeKey: `payment-claim:${payment.id}`,
        payload: { orderReference: order.reference, senderName, amountMinor: payment.amountMinor, currency: payment.currency, eventTitle: order.event.title },
      });
    }
  });
}

async function record(adminId: string, paymentId: string, confirmation: { status: "success" | "failed"; amountMinor: number }) {
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.provider !== "manual") throw new PaymentError("Payment not found.");
  if (!(OPEN as readonly string[]).includes(payment.status)) throw new PaymentError("This payment has already been handled.");
  await db.payment.update({
    where: { id: paymentId },
    data: { meta: { ...asObject(payment.meta), confirmation: { ...confirmation, currency: payment.currency, by: adminId, at: new Date().toISOString() } } as Prisma.InputJsonValue },
  });
  await db.auditLog.create({ data: { actorId: adminId, action: confirmation.status === "success" ? "payment.confirmed_manually" : "payment.rejected_manually", entityType: "Payment", entityId: paymentId, metadata: { amountMinor: confirmation.amountMinor } } });
}

/**
 * Admin confirms the money arrived (typing the amount actually received). The shared finalize step then checks
 * it against the order: exact match issues tickets, anything else goes to review. Safe to call twice.
 */
export async function confirmManualPayment(adminId: string, paymentId: string, receivedMinor: number): Promise<Outcome> {
  await record(adminId, paymentId, { status: "success", amountMinor: receivedMinor });
  return finalizePayment(paymentId);
}

export async function rejectManualPayment(adminId: string, paymentId: string): Promise<Outcome> {
  await record(adminId, paymentId, { status: "failed", amountMinor: 0 });
  return finalizePayment(paymentId);
}
