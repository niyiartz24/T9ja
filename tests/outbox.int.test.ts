import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;
process.env.APP_URL = "https://tickets.example";

describe.skipIf(!url)("ticket email outbox (database)", () => {
  let outbox: typeof import("@/lib/outbox");
  let checkout: typeof import("@/lib/checkout").checkout;
  let sendEmail: ReturnType<typeof vi.fn>;
  let db: typeof import("@/lib/db").db;
  let orgId: string, eventId: string;
  const suffix = Date.now();
  const to = `outbox-${suffix}@test.local`;

  async function freeOrder(qty: number) {
    const tt = await db.ticketType.create({ data: { eventId, name: "Free", priceMinor: 0, quantityTotal: 50 } });
    const r = await checkout({ eventId, buyerName: "Mail Buyer", buyerEmail: to, lines: [{ ticketTypeId: tt.id, quantity: qty }] });
    return db.order.findUniqueOrThrow({ where: { reference: r.reference }, include: { tickets: true } });
  }
  const jobFor = (orderId: string) => db.emailOutbox.findFirstOrThrow({ where: { dedupeKey: { startsWith: `order-tickets:${orderId}` } } });

  beforeAll(async () => {
    outbox = await import("@/lib/outbox");
    checkout = (await import("@/lib/checkout")).checkout;
    sendEmail = (await import("@/lib/email")).sendEmail as unknown as ReturnType<typeof vi.fn>;
    db = (await import("@/lib/db")).db;
    orgId = (await db.user.create({ data: { email: `ob-${suffix}@test.local`, passwordHash: "x", role: "ORGANIZER" } })).id;
    eventId = (await db.event.create({ data: { organizerId: orgId, title: "Mail", slug: `mail-${suffix}`, description: "d", status: "PUBLISHED", startsAt: new Date(Date.now() + 864e5), endsAt: new Date(Date.now() + 2 * 864e5) } })).id;
  });

  afterAll(async () => {
    await db.emailOutbox.deleteMany({ where: { to } });
    await db.ticket.deleteMany({ where: { eventId } });
    await db.orderItem.deleteMany({ where: { order: { eventId } } });
    await db.order.deleteMany({ where: { eventId } });
    await db.ticketType.deleteMany({ where: { eventId } });
    await db.event.deleteMany({ where: { id: eventId } });
    await db.auditLog.deleteMany({ where: { OR: [{ actorId: orgId }, { entityType: "Order" }] } });
    await db.user.deleteMany({ where: { id: orgId } });
    await db.$disconnect();
  });

  it("queues exactly one email per order and sends every ticket in it", async () => {
    sendEmail.mockReset().mockResolvedValue(undefined);
    const order = await freeOrder(3);
    expect(await db.emailOutbox.count({ where: { dedupeKey: `order-tickets:${order.id}` } })).toBe(1);
    await db.$transaction((tx) => outbox.enqueueTicketEmail(order.id, tx)); // enqueue again: still one
    expect(await db.emailOutbox.count({ where: { dedupeKey: `order-tickets:${order.id}` } })).toBe(1);
    await outbox.processOutbox(50);
    const call = sendEmail.mock.calls.map((c) => c[0]).find((m) => m.to === to && m.text.includes(order.reference));
    expect(call).toBeTruthy();
    for (const t of order.tickets) expect(call.html).toContain(t.code);
    expect((await jobFor(order.id)).status).toBe("SENT");
    sendEmail.mockClear();
    await outbox.processOutbox(50);
    expect(sendEmail).not.toHaveBeenCalled(); // a sent email is never sent again
  });

  it("retries a failed send without touching the order or tickets", async () => {
    sendEmail.mockReset().mockRejectedValue(new Error("provider down"));
    const order = await freeOrder(2);
    await outbox.processOutbox(50);
    let job = await jobFor(order.id);
    expect(job.status).toBe("PENDING");
    expect(job.attempts).toBe(1);
    expect(job.lastError).toMatch(/provider down/);
    expect(job.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    const still = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { tickets: true } });
    expect(still.status).toBe("PAID");
    expect(still.tickets).toHaveLength(2);

    sendEmail.mockReset().mockResolvedValue(undefined);
    await db.emailOutbox.update({ where: { id: job.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    await outbox.processOutbox(50);
    job = await jobFor(order.id);
    expect(job.status).toBe("SENT");
    expect(await db.ticket.count({ where: { orderId: order.id } })).toBe(2); // retry never issues tickets
  });

  it("gives up after the maximum number of attempts", async () => {
    sendEmail.mockReset().mockRejectedValue(new Error("still down"));
    const order = await freeOrder(1);
    const job = await jobFor(order.id);
    await db.emailOutbox.update({ where: { id: job.id }, data: { attempts: 5 } });
    await outbox.processOutbox(50);
    expect((await jobFor(order.id)).status).toBe("FAILED");
  });

  it("supports an explicit resend as a new job", async () => {
    sendEmail.mockReset().mockResolvedValue(undefined);
    const order = await freeOrder(1);
    await db.$transaction((tx) => outbox.enqueueTicketEmail(order.id, tx, { resend: true }));
    expect(await db.emailOutbox.count({ where: { dedupeKey: { startsWith: `order-tickets:${order.id}` } } })).toBe(2);
  });
});
