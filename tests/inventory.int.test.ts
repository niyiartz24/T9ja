import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;
const actor = (id: string) => ({ id, role: "ORGANIZER" as const });

describe.skipIf(!url)("inventory (database)", () => {
  let inv: typeof import("@/lib/inventory");
  let tts: typeof import("@/lib/ticket-type-service");
  let db: typeof import("@/lib/db").db;
  let orgA: string, orgB: string, eventId: string, otherEventId: string;
  const suffix = Date.now();
  const buyer = { buyerName: "Test Buyer", buyerEmail: "Buyer@Test.Local" };

  const mkType = (quantityTotal: number, extra: Record<string, unknown> = {}) =>
    db.ticketType.create({ data: { eventId, name: `T${Math.random()}`, priceMinor: 500000, quantityTotal, ...extra } });
  const reload = (id: string) => db.ticketType.findUniqueOrThrow({ where: { id } });
  const mkEvent = (organizerId: string, slug: string) =>
    db.event.create({
      data: {
        organizerId, title: slug, slug: `${slug}-${suffix}`, description: "d", status: "PUBLISHED",
        startsAt: new Date(Date.now() + 30 * 864e5), endsAt: new Date(Date.now() + 31 * 864e5),
      },
    });

  beforeAll(async () => {
    inv = await import("@/lib/inventory");
    tts = await import("@/lib/ticket-type-service");
    db = (await import("@/lib/db")).db;
    const mk = (n: string) => db.user.create({ data: { email: `${n}-${suffix}@test.local`, passwordHash: "x", role: "ORGANIZER" } });
    orgA = (await mk("inv-a")).id;
    orgB = (await mk("inv-b")).id;
    eventId = (await mkEvent(orgA, "inv-event")).id;
    otherEventId = (await mkEvent(orgA, "inv-other")).id;
  });

  afterAll(async () => {
    const events = await db.event.findMany({ where: { organizerId: { in: [orgA, orgB] } }, select: { id: true } });
    const ids = events.map((e) => e.id);
    await db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: [orgA, orgB] } }, { entityType: "Order" }, { entityType: "TicketType" }] } });
    await db.orderItem.deleteMany({ where: { order: { eventId: { in: ids } } } });
    await db.order.deleteMany({ where: { eventId: { in: ids } } });
    await db.ticketType.deleteMany({ where: { eventId: { in: ids } } });
    await db.event.deleteMany({ where: { id: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: [orgA, orgB] } } });
    await db.$disconnect();
  });

  it("never oversells under 25 concurrent buyers for 5 tickets", async () => {
    const tt = await mkType(5);
    const results = await Promise.allSettled(
      Array.from({ length: 25 }, () => inv.createReservedOrder({ eventId, ...buyer, lines: [{ ticketTypeId: tt.id, quantity: 1 }] })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    for (const r of results) if (r.status === "rejected") expect(r.reason).toBeInstanceOf(inv.InventoryError);
    const after = await reload(tt.id);
    expect(after.quantityReserved).toBe(5);
    expect(after.quantitySold + after.quantityReserved).toBeLessThanOrEqual(after.quantityTotal);
  });

  it("rolls back every line when one line cannot be reserved", async () => {
    const x = await mkType(5);
    const y = await mkType(1);
    await inv.createReservedOrder({ eventId, ...buyer, lines: [{ ticketTypeId: y.id, quantity: 1 }] });
    await expect(
      inv.createReservedOrder({ eventId, ...buyer, lines: [{ ticketTypeId: x.id, quantity: 2 }, { ticketTypeId: y.id, quantity: 1 }] }),
    ).rejects.toThrow(/not enough/i);
    expect((await reload(x.id)).quantityReserved).toBe(0);
  });

  it("prices on the server and enforces limits, activity and event membership", async () => {
    const tt = await mkType(20, { minPerOrder: 2, maxPerOrder: 4 });
    const order = await inv.createReservedOrder({ eventId, ...buyer, lines: [{ ticketTypeId: tt.id, quantity: 3 }] });
    expect(order.totalMinor).toBe(1500000);
    expect(order.buyerEmail).toBe("buyer@test.local");
    await expect(inv.createReservedOrder({ eventId, ...buyer, lines: [{ ticketTypeId: tt.id, quantity: 1 }] })).rejects.toThrow(/per order/);
    await expect(inv.createReservedOrder({ eventId, ...buyer, lines: [{ ticketTypeId: tt.id, quantity: 5 }] })).rejects.toThrow(/per order/);
    const off = await mkType(5, { isActive: false });
    await expect(inv.createReservedOrder({ eventId, ...buyer, lines: [{ ticketTypeId: off.id, quantity: 1 }] })).rejects.toThrow(/not available/);
    await expect(inv.createReservedOrder({ eventId: otherEventId, ...buyer, lines: [{ ticketTypeId: tt.id, quantity: 2 }] })).rejects.toThrow(/unavailable/);
  });

  it("confirms a sale exactly once", async () => {
    const tt = await mkType(3);
    const order = await inv.createReservedOrder({ eventId, ...buyer, lines: [{ ticketTypeId: tt.id, quantity: 2 }] });
    const both = await Promise.all([inv.confirmOrderSale(order.id), inv.confirmOrderSale(order.id)]);
    expect(both.filter(Boolean)).toHaveLength(1);
    const after = await reload(tt.id);
    expect([after.quantitySold, after.quantityReserved]).toEqual([2, 0]);
  });

  it("expires abandoned reservations, restores stock, and blocks late confirmation", async () => {
    const tt = await mkType(2);
    const order = await inv.createReservedOrder({ eventId, ...buyer, lines: [{ ticketTypeId: tt.id, quantity: 2 }] });
    await expect(inv.createReservedOrder({ eventId, ...buyer, lines: [{ ticketTypeId: tt.id, quantity: 1 }] })).rejects.toThrow(/not enough/i);
    await db.order.update({ where: { id: order.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    // the next buyer self-heals the stock without any cron
    const next = await inv.createReservedOrder({ eventId, ...buyer, lines: [{ ticketTypeId: tt.id, quantity: 1 }] });
    expect(next.status).toBe("PENDING");
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("EXPIRED");
    expect(await inv.confirmOrderSale(order.id)).toBe(false);
    expect(await inv.releaseOrder(order.id, "EXPIRED")).toBe(false);
    expect((await reload(tt.id)).quantityReserved).toBe(1);
  });

  it("refuses to lower quantity below committed stock and isolates ticket types by organizer", async () => {
    const tt = await mkType(10);
    await inv.createReservedOrder({ eventId, ...buyer, lines: [{ ticketTypeId: tt.id, quantity: 4 }] });
    const input = {
      name: "Edited", description: null, priceMinor: 100, currency: "NGN", quantityTotal: 3, minPerOrder: 1,
      maxPerOrder: 5, salesOpenAt: null, salesCloseAt: null, isActive: true,
    };
    await expect(tts.updateTicketType(actor(orgA), tt.id, input)).rejects.toThrow(/lower than/i);
    await expect(tts.updateTicketType(actor(orgB), tt.id, { ...input, quantityTotal: 10 })).rejects.toThrow(/not found/i);
    await expect(tts.setTicketTypeActive(actor(orgB), tt.id, false)).rejects.toThrow(/not found/i);
    await expect(tts.deleteTicketType(actor(orgB), tt.id)).rejects.toThrow(/not found/i);
    await expect(tts.deleteTicketType(actor(orgA), tt.id)).rejects.toThrow(/has orders/i);
  });
});
