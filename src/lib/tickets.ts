import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export class TicketError extends Error {}

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Human-readable ID printed on the ticket, e.g. 7K2M-QX9D-4HTB (60 bits). */
export function newTicketCode(): string {
  const c = Array.from(randomBytes(12), (b) => ALPHABET[b & 31]);
  return [c.slice(0, 4), c.slice(4, 8), c.slice(8, 12)].map((g) => g.join("")).join("-");
}

/** Opaque 192-bit value encoded in the QR. Carries no personal data. */
export const newQrToken = () => randomBytes(24).toString("base64url");

/**
 * Issues exactly quantity tickets per order item. Safe to call repeatedly or concurrently:
 * the unique (orderItemId, sequence) constraint plus skipDuplicates makes extra calls no-ops.
 * Refuses to issue unless the order is PAID.
 */
export async function issueTicketsForOrder(orderId: string, tx?: Prisma.TransactionClient): Promise<number> {
  const body = async (t: Prisma.TransactionClient) => {
    const order = await t.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
    if (order.status !== "PAID") throw new TicketError("Tickets can only be issued for paid orders.");
    const rows = order.items.flatMap((it) =>
      Array.from({ length: it.quantity }, (_, i) => ({
        code: newTicketCode(), qrToken: newQrToken(), orderId: order.id, orderItemId: it.id, sequence: i + 1,
        eventId: order.eventId, ticketTypeId: it.ticketTypeId, holderName: order.buyerName, holderEmail: order.buyerEmail,
      })),
    );
    await t.ticket.createMany({ data: rows, skipDuplicates: true });
    return t.ticket.count({ where: { orderId } });
  };
  return tx ? body(tx) : db.$transaction(body);
}
