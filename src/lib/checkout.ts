import { db } from "@/lib/db";
import { confirmOrderSale, createReservedOrder, releaseOrder, type Line } from "@/lib/inventory";
import { enqueueTicketEmail } from "@/lib/outbox";
import { issueTicketsForOrder } from "@/lib/tickets";

/**
 * Free orders are finalized immediately (confirm sale + issue tickets in ONE transaction).
 * Paid orders stay PENDING with stock reserved until verified payment (Phase 7).
 */
export async function checkout(input: { eventId: string; buyerName: string; buyerEmail: string; lines: Line[] }) {
  const order = await createReservedOrder(input);
  if (order.totalMinor > 0) return { reference: order.reference, status: "PENDING" as const };
  try {
    await db.$transaction(async (tx) => {
      await confirmOrderSale(order.id, tx);
      await issueTicketsForOrder(order.id, tx);
      await enqueueTicketEmail(order.id, tx);
    });
  } catch (e) {
    await releaseOrder(order.id, "FAILED").catch(() => {});
    throw e;
  }
  return { reference: order.reference, status: "PAID" as const };
}
