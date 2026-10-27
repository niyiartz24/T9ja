import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

describe.skipIf(!url)("checkout, ticket issuance and rate limiting (database)", () => {
  let checkout: typeof import("@/lib/checkout").checkout;
  let tickets: typeof import("@/lib/tickets");
  let inv: typeof import("@/lib/inventory");
  let rl: typeof import("@/lib/rate-limit-core");
  let db: typeof import("@/lib/db").db;
  let orgId: string, eventId: string;
  const suffix = Date.now();
  const buyer = { buyerName: "Free Buyer", buyerEmail: "free@test.local" };

  const mkType = (quantityTotal: number, priceMinor: number) =>
    db.ticketType.create({ data: { eventId, name: `T${Math.random()}`, priceMinor, quantityTotal } });

  beforeAll(async () => {
    checkout = (await import("@/lib/checkout")).checkout;
    tickets = await import("@/lib/tickets");
    inv = await import("@/lib/inventory");
    rl = await import("@/lib/rate-limit-core");
    db = (await import("@/lib/db")).db;
    orgId = (await db.user.create({ data: { email: `co-${suffix}@test.local`, passwordHash: "x", role: "ORGANIZER" } })).id;
    eventId = (await db.event.create({
      data: {
        organizerId: orgId, title: "Checkout", slug: `checkout-${suffix}`, description: "d", status: "PUBLISHED",
        startsAt: new Date(Date.now() + 30 * 864e5), endsAt: new Date(Date.now() + 31 * 864e5),
      },
    })).id;
  });

  afterAll(async () => {
    await db.auditLog.deleteMany({ where: { OR: [{ actorId: orgId }, { entityType: "Order" }] } });
    await db.ticket.deleteMany({ where: { eventId } });
    await db.orderItem.deleteMany({ where: { order: { eventId } } });
    await db.order.deleteMany({ where: { eventId } });
    await db.ticketType.deleteMany({ where: { eventId } });
    await db.event.deleteMany({ where: { id: eventId } });
    await db.user.deleteMany({ where: { id: orgId } });
    await db.rateLimitBucket.deleteMany({ where: { key: { startsWith: `test-${suffix}` } } });
    await db.$disconnect();
  });

  it("completes a free checkout: paid order, exact ticket count, stock moved to sold", async () => {
    const tt = await mkType(10, 0);
    const r = await checkout({ eventId, ...buyer, lines: [{ ticketTypeId: tt.id, quantity: 3 }] });
    expect(r.status).toBe("PAID");
    const order = await db.order.findUniqueOrThrow({ where: { reference: r.reference }, include: { tickets: true } });
    expect(order.status).toBe("PAID");
    expect(order.tickets).toHaveLength(3);
    expect(new Set(order.tickets.map((t) => t.code)).size).toBe(3);
    expect(new Set(order.tickets.map((t) => t.qrToken)).size).toBe(3);
    const after = await db.ticketType.findUniqueOrThrow({ where: { id: tt.id } });
    expect([after.quantitySold, after.quantityReserved]).toEqual([3, 0]);
  });

  it("keeps paid checkouts pending with no tickets", async () => {
    const tt = await mkType(10, 500000);
    const r = await checkout({ eventId, ...buyer, lines: [{ ticketTypeId: tt.id, quantity: 2 }] });
    expect(r.status).toBe("PENDING");
    const order = await db.order.findUniqueOrThrow({ where: { reference: r.reference }, include: { tickets: true } });
    expect(order.tickets).toHaveLength(0);
    await expect(tickets.issueTicketsForOrder(order.id)).rejects.toThrow(/paid orders/);
  });

  it("issuance is idempotent, including concurrent calls", async () => {
    const tt = await mkType(10, 0);
    const r = await checkout({ eventId, ...buyer, lines: [{ ticketTypeId: tt.id, quantity: 4 }] });
    const order = await db.order.findUniqueOrThrow({ where: { reference: r.reference } });
    const counts = await Promise.all([1, 2, 3, 4, 5].map(() => tickets.issueTicketsForOrder(order.id)));
    expect(counts.every((c) => c === 4)).toBe(true);
    expect(await db.ticket.count({ where: { orderId: order.id } })).toBe(4);
  });

  it("never oversells free tickets under concurrency", async () => {
    const tt = await mkType(3, 0);
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () => checkout({ eventId, ...buyer, lines: [{ ticketTypeId: tt.id, quantity: 1 }] })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(await db.ticket.count({ where: { ticketTypeId: tt.id } })).toBe(3);
    for (const r of results) if (r.status === "rejected") expect(r.reason).toBeInstanceOf(inv.InventoryError);
  });

  it("rate limiter allows up to the limit, then blocks, then resets after the window", async () => {
    const key = `test-${suffix}-rl`;
    const outcomes: boolean[] = [];
    for (let i = 0; i < 5; i++) outcomes.push(await rl.consume(key, 3, 60));
    expect(outcomes).toEqual([true, true, true, false, false]);
    await db.rateLimitBucket.update({ where: { key }, data: { windowStart: new Date(Date.now() - 120_000) } });
    expect(await rl.consume(key, 3, 60)).toBe(true);
  });
});
