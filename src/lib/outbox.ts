import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { formatMinor } from "@/lib/money";
import { ticketsEmail } from "@/lib/ticket-email";

const MAX_ATTEMPTS = 6;
const backoffMinutes = (attempt: number) => Math.min(60, 2 ** attempt);

/**
 * Queue the ticket email inside the same transaction that issues the tickets.
 * dedupeKey makes this idempotent: one email per order no matter how many times it runs.
 * A failed send can never undo a payment or issue extra tickets: sending happens later, from the queue.
 */
export async function enqueueTicketEmail(orderId: string, tx: Prisma.TransactionClient, opts: { resend?: boolean } = {}) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { buyerEmail: true } });
  const dedupeKey = opts.resend ? `order-tickets:${orderId}:${Date.now()}` : `order-tickets:${orderId}`;
  await tx.emailOutbox.createMany({
    data: [{ to: order.buyerEmail, template: "tickets", payload: { orderId }, dedupeKey }],
    skipDuplicates: true,
  });
}

async function deliver(job: { to: string; template: string; payload: unknown }) {
  if (job.template === "payment-claim") return deliverClaimAlert(job);
  if (job.template !== "tickets") throw new Error(`Unknown email template ${job.template}`);
  const { orderId } = job.payload as { orderId: string };
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      event: true,
      tickets: { orderBy: [{ ticketTypeId: "asc" }, { sequence: "asc" }], include: { ticketType: { select: { name: true } } } },
    },
  });
  if (!order || order.status === "REFUNDED" || order.status === "CANCELLED") return; // nothing to send any more
  if (order.status !== "PAID" || order.tickets.length === 0) throw new Error("Order not ready for ticket email");
  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new Error("APP_URL is not configured");
  const mail = ticketsEmail({
    buyerName: order.buyerName, orderReference: order.reference, appUrl, event: order.event,
    tickets: order.tickets.map((t) => ({ code: t.code, qrToken: t.qrToken, typeName: t.ticketType.name })),
    receipt: { totalMinor: order.totalMinor, currency: order.currency, referralCode: order.referralCode },
  });
  await sendEmail({ to: job.to, ...mail });
}

/** Sends due emails with a lease so concurrent workers never double-send, and retries with backoff. */
export async function processOutbox(limit = 10): Promise<number> {
  const now = new Date();
  const due = await db.emailOutbox.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: now } },
    orderBy: { nextAttemptAt: "asc" }, take: limit,
  });
  let sent = 0;
  for (const job of due) {
    const lease = await db.emailOutbox.updateMany({
      where: { id: job.id, status: "PENDING", nextAttemptAt: { lte: now } },
      data: { nextAttemptAt: new Date(Date.now() + 5 * 60_000) },
    });
    if (lease.count !== 1) continue; // another worker has it
    try {
      await deliver(job);
      await db.emailOutbox.update({ where: { id: job.id }, data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 }, lastError: null } });
      sent++;
    } catch (e) {
      const attempts = job.attempts + 1;
      await db.emailOutbox.update({
        where: { id: job.id },
        data: {
          attempts, lastError: (e instanceof Error ? e.message : String(e)).slice(0, 300),
          status: attempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
          nextAttemptAt: new Date(Date.now() + backoffMinutes(attempts) * 60_000),
        },
      });
    }
  }
  return sent;
}

/** Generic, idempotent enqueue (dedupeKey) for any template. */
export async function enqueueEmail(tx: Prisma.TransactionClient, e: { to: string; template: string; payload: Prisma.InputJsonValue; dedupeKey: string }) {
  await tx.emailOutbox.createMany({ data: [{ to: e.to, template: e.template, payload: e.payload, dedupeKey: e.dedupeKey }], skipDuplicates: true });
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function deliverClaimAlert(job: { to: string; payload: unknown }) {
  const p = job.payload as { orderReference: string; senderName: string; amountMinor: number; currency: string; eventTitle: string };
  const link = `${(process.env.APP_URL ?? "").replace(/\/+$/, "")}/admin/payments`;
  const amount = formatMinor(p.amountMinor, p.currency);
  await sendEmail({
    to: job.to,
    subject: `Bank transfer to verify: ${p.orderReference}`,
    text: `A customer says they have paid ${amount} for ${p.eventTitle}.\nOrder: ${p.orderReference}\nSender name: ${p.senderName}\nCheck your bank statement, then confirm it here: ${link}`,
    html: `<p>A customer says they have paid <strong>${esc(amount)}</strong> for ${esc(p.eventTitle)}.</p><p>Order: <strong>${esc(p.orderReference)}</strong><br>Sender name: ${esc(p.senderName)}</p><p>Check your bank statement, then <a href="${link}">confirm it here</a>.</p>`,
  });
}
