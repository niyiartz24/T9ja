import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { MAX_TICKETS_PER_ORDER, salesWindowProblem } from "@/lib/ticket-types";

/**
 * Concurrency model: stock changes are single conditional UPDATE statements
 * (the availability check and the increment happen atomically under the row lock),
 * so concurrent buyers can never push reserved + sold above the total.
 * Every function accepts an optional transaction so Phase 7/8 can compose
 * payment finalization and ticket issuance into one atomic unit.
 */
export class InventoryError extends Error {}

type Tx = Prisma.TransactionClient;
const run = <T>(fn: (tx: Tx) => Promise<T>, tx?: Tx) => (tx ? fn(tx) : db.$transaction(fn));

export const RESERVATION_MS = 15 * 60 * 1000;
export type Line = { ticketTypeId: string; quantity: number };

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function newOrderReference(): string {
  const bytes = randomBytes(10);
  return "T9-" + Array.from(bytes, (b) => ALPHABET[b & 31]).join("");
}

async function reserve(tx: Tx, ticketTypeId: string, q: number) {
  return tx.$executeRaw`UPDATE "TicketType"
    SET "quantityReserved" = "quantityReserved" + ${q}
    WHERE "id" = ${ticketTypeId} AND "quantityTotal" - "quantitySold" - "quantityReserved" >= ${q}`;
}

async function unreserve(tx: Tx, ticketTypeId: string, q: number) {
  return tx.$executeRaw`UPDATE "TicketType"
    SET "quantityReserved" = "quantityReserved" - ${q}
    WHERE "id" = ${ticketTypeId} AND "quantityReserved" >= ${q}`;
}

async function commitSale(tx: Tx, ticketTypeId: string, q: number) {
  return tx.$executeRaw`UPDATE "TicketType"
    SET "quantityReserved" = "quantityReserved" - ${q}, "quantitySold" = "quantitySold" + ${q}
    WHERE "id" = ${ticketTypeId} AND "quantityReserved" >= ${q}`;
}

/** Server-side pricing and validation. Nothing here trusts client prices or availability. */
export async function createReservedOrder(
  input: { eventId: string; buyerName: string; buyerEmail: string; lines: Line[]; referralCode?: string | null },
  now = new Date(),
) {
  const merged = new Map<string, number>();
  for (const l of input.lines) {
    if (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > MAX_TICKETS_PER_ORDER) {
      throw new InventoryError("Invalid ticket quantity.");
    }
    merged.set(l.ticketTypeId, (merged.get(l.ticketTypeId) ?? 0) + l.quantity);
  }
  if (merged.size < 1 || merged.size > 10) throw new InventoryError("Select between 1 and 10 ticket types.");

  // Self-healing: reclaim stock from abandoned checkouts before checking availability.
  await expireStaleOrders({ eventId: input.eventId, now }).catch((e) => console.error("expiry failed", e));

  return db.$transaction(async (tx) => {
    const event = await tx.event.findUnique({ where: { id: input.eventId } });
    if (!event || event.status !== "PUBLISHED") throw new InventoryError("Tickets are not on sale for this event.");

    const ids = [...merged.keys()].sort(); // stable lock order avoids deadlocks
    const types = await tx.ticketType.findMany({ where: { id: { in: ids }, eventId: event.id } });
    if (types.length !== ids.length) throw new InventoryError("One of the selected tickets is unavailable.");
    if (new Set(types.map((t) => t.currency)).size !== 1) throw new InventoryError("Mixed currencies are not supported.");

    let subtotal = 0;
    const items: { ticketTypeId: string; quantity: number; unitPriceMinor: number }[] = [];
    for (const id of ids) {
      const tt = types.find((t) => t.id === id)!;
      const q = merged.get(id)!;
      if (!tt.isActive) throw new InventoryError(`"${tt.name}" is not available.`);
      const problem = salesWindowProblem(event, tt, now);
      if (problem) throw new InventoryError(problem);
      if (q < tt.minPerOrder || q > tt.maxPerOrder) {
        throw new InventoryError(`You can buy ${tt.minPerOrder} to ${tt.maxPerOrder} "${tt.name}" tickets per order.`);
      }
      if ((await reserve(tx, id, q)) !== 1) throw new InventoryError(`Not enough "${tt.name}" tickets left.`);
      subtotal += tt.priceMinor * q;
      items.push({ ticketTypeId: id, quantity: q, unitPriceMinor: tt.priceMinor });
    }

    const order = await tx.order.create({
      data: {
        reference: newOrderReference(), eventId: event.id,
        buyerName: input.buyerName.trim(), buyerEmail: input.buyerEmail.trim().toLowerCase(), referralCode: input.referralCode ?? null,
        subtotalMinor: subtotal, totalMinor: subtotal, currency: types[0].currency,
        expiresAt: new Date(now.getTime() + RESERVATION_MS),
        items: { create: items },
      },
      include: { items: true },
    });
    await tx.auditLog.create({ data: { action: "order.create", entityType: "Order", entityId: order.id } });
    return order;
  });
}

/** PENDING -> PAID and reserved -> sold. Idempotent: returns false if the order was not PENDING. */
export function confirmOrderSale(orderId: string, tx?: Tx): Promise<boolean> {
  return run(async (t) => {
    const r = await t.order.updateMany({ where: { id: orderId, status: "PENDING" }, data: { status: "PAID", paidAt: new Date() } });
    if (r.count !== 1) return false;
    for (const it of await t.orderItem.findMany({ where: { orderId } })) {
      if ((await commitSale(t, it.ticketTypeId, it.quantity)) !== 1) {
        throw new InventoryError("Inventory inconsistency while confirming order.");
      }
    }
    return true;
  }, tx);
}

/** PENDING -> terminal status and reservation released. Idempotent. */
export function releaseOrder(orderId: string, status: "EXPIRED" | "CANCELLED" | "FAILED", tx?: Tx): Promise<boolean> {
  return run(async (t) => {
    const r = await t.order.updateMany({ where: { id: orderId, status: "PENDING" }, data: { status } });
    if (r.count !== 1) return false;
    for (const it of await t.orderItem.findMany({ where: { orderId } })) {
      if ((await unreserve(t, it.ticketTypeId, it.quantity)) !== 1) {
        throw new InventoryError("Inventory inconsistency while releasing order.");
      }
    }
    return true;
  }, tx);
}

export async function expireStaleOrders(opts: { eventId?: string; now?: Date; limit?: number } = {}) {
  const stale = await db.order.findMany({
    where: { status: "PENDING", expiresAt: { lte: opts.now ?? new Date() }, ...(opts.eventId ? { eventId: opts.eventId } : {}) },
    select: { id: true },
    take: opts.limit ?? 200,
  });
  let released = 0;
  for (const o of stale) if (await releaseOrder(o.id, "EXPIRED")) released++;
  return released;
}

/**
 * A payment succeeded after its order's reservation expired. Re-reserve the stock if it is still
 * available (all or nothing). Returns false when the stock is gone or the event is no longer on sale,
 * in which case the caller must flag the payment for refund.
 */
export async function reviveExpiredOrder(orderId: string): Promise<boolean> {
  try {
    return await db.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true, event: true } });
      if (!order || order.status !== "EXPIRED" || order.event.status !== "PUBLISHED") return false;
      const items = [...order.items].sort((a, b) => a.ticketTypeId.localeCompare(b.ticketTypeId));
      for (const it of items) {
        if ((await reserve(tx, it.ticketTypeId, it.quantity)) !== 1) throw new InventoryError("Stock no longer available.");
      }
      const r = await tx.order.updateMany({
        where: { id: orderId, status: "EXPIRED" },
        data: { status: "PENDING", expiresAt: new Date(Date.now() + RESERVATION_MS) },
      });
      if (r.count !== 1) throw new InventoryError("Order changed concurrently.");
      return true;
    });
  } catch (e) {
    if (e instanceof InventoryError) return false;
    throw e;
  }
}
