import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { confirmOrderSale, reviveExpiredOrder } from "@/lib/inventory";
import { enqueueTicketEmail } from "@/lib/outbox";
import { issueTicketsForOrder } from "@/lib/tickets";
import { getProvider } from "./registry";

export class PaymentError extends Error {}
export class WebhookAuthError extends Error {}

export type Outcome = "issued" | "already" | "pending" | "failed" | "review" | "refund_required";

const OPEN = ["INITIATED", "PENDING"] as const;
const newPaymentReference = () => "P9-" + randomBytes(12).toString("hex");
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/** Creates a payment attempt and returns where to send the customer. */
export async function startPayment(orderReference: string, baseUrl: string): Promise<string> {
  const provider = getProvider();
  const order = await db.order.findUnique({ where: { reference: orderReference } });
  if (!order || order.status !== "PENDING" || order.totalMinor <= 0) throw new PaymentError("This order can no longer be paid.");
  if (order.expiresAt && order.expiresAt <= new Date()) throw new PaymentError("This reservation has expired. Please start a new order.");

  const reference = newPaymentReference();
  const payment = await db.payment.create({
    data: { orderId: order.id, provider: provider.name, providerReference: reference, amountMinor: order.totalMinor, currency: order.currency },
  });
  try {
    const { authorizationUrl } = await provider.initialize({
      paymentReference: reference, orderReference: order.reference, amountMinor: order.totalMinor,
      currency: order.currency, buyerEmail: order.buyerEmail, callbackUrl: `${baseUrl}/orders/${order.reference}`,
    });
    await db.payment.update({ where: { id: payment.id }, data: { status: "PENDING" } });
    // Hold the stock while the customer is at the gateway (bounded: only for orders under 2 hours old).
    await db.order.updateMany({
      where: { id: order.id, status: "PENDING", createdAt: { gt: new Date(Date.now() - 2 * 3600_000) } },
      data: { expiresAt: new Date(Date.now() + 30 * 60_000) },
    });
    return authorizationUrl;
  } catch (e) {
    console.error("payment initialization failed", e);
    await db.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
    throw new PaymentError("Could not start payment. Please try again.");
  }
}

/**
 * The only place a paid order is finalized. Asks the gateway for the truth and checks reference, amount
 * and currency against OUR records before touching inventory or issuing a single ticket.
 * Idempotent: safe to call from webhooks, the return page and retries, concurrently.
 */
export async function finalizePayment(paymentId: string): Promise<Outcome> {
  const payment = await db.payment.findUnique({ where: { id: paymentId }, include: { order: true } });
  if (!payment) throw new PaymentError("Payment not found.");
  if (!(OPEN as readonly string[]).includes(payment.status)) return "already";

  const v = await getProvider(payment.provider).verify(payment.providerReference);
  if (v.status === "pending") return "pending";

  if (v.status === "failed") {
    const r = await db.payment.updateMany({ where: { id: paymentId, status: { in: [...OPEN] } }, data: { status: "FAILED" } });
    if (r.count === 1) await db.auditLog.create({ data: { action: "payment.failed", entityType: "Payment", entityId: paymentId } });
    return "failed";
  }

  const matches =
    v.reference === payment.providerReference &&
    v.amountMinor === payment.amountMinor && v.currency === payment.currency &&
    payment.amountMinor === payment.order.totalMinor && payment.currency === payment.order.currency;
  if (!matches) {
    // The gateway reports money but it does not match the order: never issue tickets, a human must review.
    const r = await db.payment.updateMany({ where: { id: paymentId, status: { in: [...OPEN] } }, data: { status: "REVIEW" } });
    if (r.count === 1) {
      await db.auditLog.create({
        data: {
          action: "payment.review", entityType: "Payment", entityId: paymentId,
          metadata: { expected: { amountMinor: payment.order.totalMinor, currency: payment.order.currency }, reported: { amountMinor: v.amountMinor, currency: v.currency } },
        },
      });
    }
    return "review";
  }

  if (payment.order.status === "EXPIRED") await reviveExpiredOrder(payment.orderId);

  return db.$transaction(async (tx): Promise<Outcome> => {
    const claimed = await tx.payment.updateMany({
      where: { id: paymentId, status: { in: [...OPEN] } },
      data: { status: "SUCCEEDED", verifiedAt: new Date() },
    });
    if (claimed.count !== 1) return "already";
    if (await confirmOrderSale(payment.orderId, tx)) {
      await issueTicketsForOrder(payment.orderId, tx);
      await enqueueTicketEmail(payment.orderId, tx);
      await tx.auditLog.create({ data: { action: "payment.succeeded", entityType: "Payment", entityId: paymentId } });
      return "issued";
    }
    // Money received, but this order cannot be fulfilled by it (already paid, cancelled, or stock gone).
    await tx.payment.update({ where: { id: paymentId }, data: { refundRequired: true } });
    await tx.auditLog.create({ data: { action: "payment.refund_required", entityType: "Payment", entityId: paymentId } });
    return "refund_required";
  });
}

/** Authenticated, idempotent webhook handling. Throws WebhookAuthError on a bad signature. */
export async function processWebhook(providerName: string, rawBody: string, headers: Headers) {
  const provider = getProvider(providerName);
  if (!provider.validateWebhook(rawBody, headers)) throw new WebhookAuthError("Invalid signature");
  const evt = provider.parseWebhook(rawBody);
  if (!evt) return { handled: false, duplicate: false };

  let row;
  try {
    row = await db.paymentEvent.create({
      data: { provider: provider.name, providerEventId: evt.eventId, type: evt.type, payload: JSON.parse(rawBody) as Prisma.InputJsonValue },
    });
  } catch (e) {
    if (!isUnique(e)) throw e;
    const existing = await db.paymentEvent.findUnique({
      where: { provider_providerEventId: { provider: provider.name, providerEventId: evt.eventId } },
    });
    if (!existing || existing.processedAt) return { handled: true, duplicate: true };
    row = existing; // seen before but never finished: process again (finalizePayment is idempotent)
  }

  if ((evt.type === "payment.succeeded" || evt.type === "payment.failed") && evt.reference) {
    const payment = await db.payment.findUnique({
      where: { provider_providerReference: { provider: provider.name, providerReference: evt.reference } },
    });
    if (payment) {
      await db.paymentEvent.update({ where: { id: row.id }, data: { paymentId: payment.id } });
      await finalizePayment(payment.id);
    }
  }
  await db.paymentEvent.update({ where: { id: row.id }, data: { processedAt: new Date() } });
  return { handled: true, duplicate: false };
}

/** Called when a customer returns to the order page. Verifies with the gateway; never trusts the redirect. */
export async function verifyOrderPayments(orderId: string): Promise<boolean> {
  const open = await db.payment.findMany({
    where: { orderId, status: { in: [...OPEN] } },
    select: { id: true }, orderBy: { createdAt: "desc" }, take: 3,
  });
  let changed = false;
  for (const p of open) {
    try {
      if ((await finalizePayment(p.id)) !== "pending") changed = true;
    } catch (e) {
      console.error("payment verification failed", e);
    }
  }
  return changed;
}

/** Super Admin refund. Ticket and stock effects apply only when this payment is what paid the order. */
export async function refundPayment(actorId: string, paymentId: string) {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: { order: { include: { items: true, tickets: true } } },
  });
  if (!payment || (payment.status !== "SUCCEEDED" && payment.status !== "REVIEW")) {
    throw new PaymentError("Only payments that were taken can be refunded.");
  }
  const provider = getProvider(payment.provider);
  if (!provider.refund) throw new PaymentError("This provider does not support automatic refunds. Refund from the provider's dashboard.");

  const order = payment.order;
  const fullOrderRefund = order.status === "PAID" && !payment.refundRequired && payment.status === "SUCCEEDED";
  if (fullOrderRefund && order.tickets.some((t) => t.status === "USED")) {
    throw new PaymentError("Tickets from this order have already been used.");
  }
  if (!(await provider.refund({ providerReference: payment.providerReference, amountMinor: payment.amountMinor })).ok) {
    throw new PaymentError("The provider rejected the refund.");
  }
  await db.$transaction(async (tx) => {
    await tx.payment.update({ where: { id: paymentId }, data: { status: "REFUNDED", refundRequired: false } });
    if (fullOrderRefund) {
      await tx.order.update({ where: { id: order.id }, data: { status: "REFUNDED" } });
      await tx.ticket.updateMany({ where: { orderId: order.id, status: "VALID" }, data: { status: "REFUNDED" } });
      for (const it of order.items) {
        await tx.$executeRaw`UPDATE "TicketType" SET "quantitySold" = GREATEST("quantitySold" - ${it.quantity}, 0) WHERE "id" = ${it.ticketTypeId}`;
      }
    }
    await tx.auditLog.create({
      data: { actorId, action: "payment.refunded", entityType: "Payment", entityId: paymentId, metadata: { fullOrderRefund } },
    });
  });
}
