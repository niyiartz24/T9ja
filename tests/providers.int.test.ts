import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

describe.skipIf(!url)("choosing between payment methods (database)", () => {
  let pay: typeof import("@/lib/payments/service");
  let reg: typeof import("@/lib/payments/registry");
  let checkout: typeof import("@/lib/checkout").checkout;
  let db: typeof import("@/lib/db").db;
  let orgId: string, eventId: string;
  const suffix = Date.now();
  const buyer = { buyerName: "Method Buyer", buyerEmail: "method@test.local" };

  async function order() {
    const tt = await db.ticketType.create({ data: { eventId, name: "Paid", priceMinor: 500000, quantityTotal: 20 } });
    const r = await checkout({ eventId, ...buyer, lines: [{ ticketTypeId: tt.id, quantity: 1 }] });
    return db.order.findUniqueOrThrow({ where: { reference: r.reference } });
  }

  beforeAll(async () => {
    process.env.PAYMENT_PROVIDERS = "manual,mock"; // two methods available at once
    pay = await import("@/lib/payments/service");
    reg = await import("@/lib/payments/registry");
    checkout = (await import("@/lib/checkout")).checkout;
    db = (await import("@/lib/db")).db;
    orgId = (await db.user.create({ data: { email: `prov-${suffix}@test.local`, passwordHash: "x", role: "ORGANIZER" } })).id;
    eventId = (await db.event.create({ data: { organizerId: orgId, title: "Methods", slug: `methods-${suffix}`, description: "d", status: "PUBLISHED", startsAt: new Date(Date.now() + 864e5), endsAt: new Date(Date.now() + 2 * 864e5) } })).id;
  });

  afterAll(async () => {
    delete process.env.PAYMENT_PROVIDERS;
    await db.emailOutbox.deleteMany({ where: { to: buyer.buyerEmail } });
    await db.payment.deleteMany({ where: { order: { eventId } } });
    await db.orderItem.deleteMany({ where: { order: { eventId } } });
    await db.order.deleteMany({ where: { eventId } });
    await db.ticketType.deleteMany({ where: { eventId } });
    await db.event.deleteMany({ where: { id: eventId } });
    await db.auditLog.deleteMany({ where: { OR: [{ actorId: orgId }, { entityType: "Order" }] } });
    await db.user.deleteMany({ where: { id: orgId } });
    await db.$disconnect();
  });

  it("starts the method the customer picked, defaulting to the first one", async () => {
    const a = await order();
    await pay.startPayment(a.reference, "http://localhost:3000"); // default = first = manual
    expect((await db.payment.findFirstOrThrow({ where: { orderId: a.id } })).provider).toBe("manual");
    const b = await order();
    await pay.startPayment(b.reference, "http://localhost:3000", { provider: "mock" });
    expect((await db.payment.findFirstOrThrow({ where: { orderId: b.id } })).provider).toBe("mock");
  });

  it("refuses a method that is not enabled or unknown", async () => {
    const o = await order();
    await expect(pay.startPayment(o.reference, "http://localhost:3000", { provider: "payonus" })).rejects.toBeInstanceOf(reg.PaymentConfigError);
    await expect(pay.startPayment(o.reference, "http://localhost:3000", { provider: "nonsense" })).rejects.toBeInstanceOf(reg.PaymentConfigError);
    expect(await db.payment.count({ where: { orderId: o.id } })).toBe(0);
  });

  it("reuses the open bank-transfer attempt, and lets a customer switch method", async () => {
    const o = await order();
    await pay.startPayment(o.reference, "http://localhost:3000", { provider: "manual" });
    await pay.startPayment(o.reference, "http://localhost:3000", { provider: "manual" });
    expect(await db.payment.count({ where: { orderId: o.id, provider: "manual" } })).toBe(1);
    await pay.startPayment(o.reference, "http://localhost:3000", { provider: "mock" });
    expect(await db.payment.count({ where: { orderId: o.id } })).toBe(2);
  });
});
