import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;
process.env.PAYMENT_PROVIDER = "mock";
process.env.PAYMENT_WEBHOOK_SECRET = "test-secret-for-webhooks";

describe.skipIf(!url)("payments (database)", () => {
  let pay: typeof import("@/lib/payments/service");
  let mock: typeof import("@/lib/payments/mock");
  let inv: typeof import("@/lib/inventory");
  let checkout: typeof import("@/lib/checkout").checkout;
  let db: typeof import("@/lib/db").db;
  let orgId: string, eventId: string;
  const suffix = Date.now();
  const buyer = { buyerName: "Pay Buyer", buyerEmail: "pay@test.local" };
  let n = 0;

  const mkType = (quantityTotal: number) =>
    db.ticketType.create({ data: { eventId, name: `T${Math.random()}`, priceMinor: 500000, quantityTotal } });

  /** Creates a pending paid order and a payment attempt; returns ids and the gateway reference. */
  async function pending(qty: number, typeId?: string) {
    const tt = typeId ? await db.ticketType.findUniqueOrThrow({ where: { id: typeId } }) : await mkType(10);
    const r = await checkout({ eventId, ...buyer, lines: [{ ticketTypeId: tt.id, quantity: qty }] });
    const order = await db.order.findUniqueOrThrow({ where: { reference: r.reference } });
    const authUrl = await pay.startPayment(order.reference, "http://localhost:3000");
    const ref = authUrl.split("/").pop()!;
    return { order, ref, tt };
  }
  const gateway = (ref: string, status: "success" | "failed", amountMinor: number, currency = "NGN") =>
    db.platformSetting.upsert({ where: { key: `mockgw:${ref}` }, create: { key: `mockgw:${ref}`, value: { status, amountMinor, currency } }, update: { value: { status, amountMinor, currency } } });
  const webhook = (ref: string, type = "charge.success", id = `evt-${suffix}-${n++}`, sig?: string) => {
    const body = JSON.stringify({ id, type, reference: ref });
    return pay.processWebhook("mock", body, new Headers({ "x-mock-signature": sig ?? mock.signMock(body) }));
  };
  const ticketCount = (orderId: string) => db.ticket.count({ where: { orderId } });

  beforeAll(async () => {
    pay = await import("@/lib/payments/service");
    mock = await import("@/lib/payments/mock");
    inv = await import("@/lib/inventory");
    checkout = (await import("@/lib/checkout")).checkout;
    db = (await import("@/lib/db")).db;
    orgId = (await db.user.create({ data: { email: `pay-${suffix}@test.local`, passwordHash: "x", role: "ORGANIZER" } })).id;
    eventId = (await db.event.create({
      data: {
        organizerId: orgId, title: "Pay", slug: `pay-${suffix}`, description: "d", status: "PUBLISHED",
        startsAt: new Date(Date.now() + 30 * 864e5), endsAt: new Date(Date.now() + 31 * 864e5),
      },
    })).id;
  });

  afterAll(async () => {
    await db.paymentEvent.deleteMany({ where: { OR: [{ payment: { order: { eventId } } }, { providerEventId: { startsWith: `evt-${suffix}` } }] } });
    await db.payment.deleteMany({ where: { order: { eventId } } });
    await db.ticket.deleteMany({ where: { eventId } });
    await db.orderItem.deleteMany({ where: { order: { eventId } } });
    await db.order.deleteMany({ where: { eventId } });
    await db.ticketType.deleteMany({ where: { eventId } });
    await db.event.deleteMany({ where: { id: eventId } });
    await db.auditLog.deleteMany({ where: { OR: [{ actorId: orgId }, { entityType: { in: ["Order", "Payment"] } }] } });
    await db.platformSetting.deleteMany({ where: { key: { startsWith: "mockgw:P9-" } } });
    await db.user.deleteMany({ where: { id: orgId } });
    await db.$disconnect();
  });

  it("issues tickets once for a verified payment and ignores the duplicate webhook", async () => {
    const { order, ref, tt } = await pending(2);
    await gateway(ref, "success", order.totalMinor);
    const id = `evt-${suffix}-dup`;
    expect((await webhook(ref, "charge.success", id)).duplicate).toBe(false);
    expect((await webhook(ref, "charge.success", id)).duplicate).toBe(true);
    expect(await ticketCount(order.id)).toBe(2);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PAID");
    const after = await db.ticketType.findUniqueOrThrow({ where: { id: tt.id } });
    expect([after.quantitySold, after.quantityReserved]).toEqual([2, 0]);
  });

  it("handles simultaneous webhook deliveries without duplicate tickets", async () => {
    const { order, ref } = await pending(3);
    await gateway(ref, "success", order.totalMinor);
    await Promise.all(Array.from({ length: 6 }, () => webhook(ref)));
    expect(await ticketCount(order.id)).toBe(3);
    expect(await db.payment.count({ where: { orderId: order.id, status: "SUCCEEDED" } })).toBe(1);
  });

  it("rejects a forged webhook and changes nothing", async () => {
    const { order, ref } = await pending(1);
    await gateway(ref, "success", order.totalMinor);
    await expect(webhook(ref, "charge.success", undefined, "f".repeat(64))).rejects.toBeInstanceOf(pay.WebhookAuthError);
    expect(await ticketCount(order.id)).toBe(0);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING");
  });

  it("does not trust a webhook the gateway cannot confirm, nor a success redirect", async () => {
    const { order, ref } = await pending(1);
    await webhook(ref); // validly signed, but the gateway ledger has nothing
    expect(await ticketCount(order.id)).toBe(0);
    expect(await pay.verifyOrderPayments(order.id)).toBe(false); // the customer-return path
    expect(await ticketCount(order.id)).toBe(0);
    expect((await db.payment.findFirstOrThrow({ where: { providerReference: ref } })).status).toBe("PENDING");
  });

  it("sends an amount or currency mismatch to review and issues nothing", async () => {
    const a = await pending(2);
    await gateway(a.ref, "success", a.order.totalMinor - 1);
    await webhook(a.ref);
    expect((await db.payment.findFirstOrThrow({ where: { providerReference: a.ref } })).status).toBe("REVIEW");
    expect(await ticketCount(a.order.id)).toBe(0);
    expect((await db.order.findUniqueOrThrow({ where: { id: a.order.id } })).status).toBe("PENDING");

    const b = await pending(1);
    await gateway(b.ref, "success", b.order.totalMinor, "USD");
    await webhook(b.ref);
    expect((await db.payment.findFirstOrThrow({ where: { providerReference: b.ref } })).status).toBe("REVIEW");
  });

  it("marks a declined payment failed without touching the order", async () => {
    const { order, ref } = await pending(1);
    await gateway(ref, "failed", order.totalMinor);
    await webhook(ref, "charge.failed");
    expect((await db.payment.findFirstOrThrow({ where: { providerReference: ref } })).status).toBe("FAILED");
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING");
  });

  it("honours a late payment on an expired order when stock remains", async () => {
    const { order, ref, tt } = await pending(2);
    await db.order.update({ where: { id: order.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await inv.expireStaleOrders({ eventId });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("EXPIRED");
    await gateway(ref, "success", order.totalMinor);
    await webhook(ref);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PAID");
    expect(await ticketCount(order.id)).toBe(2);
    const after = await db.ticketType.findUniqueOrThrow({ where: { id: tt.id } });
    expect(after.quantitySold + after.quantityReserved).toBeLessThanOrEqual(after.quantityTotal);
  });

  it("flags a late payment for refund when the stock is gone, and never oversells", async () => {
    const tt = await mkType(2);
    const a = await pending(2, tt.id);
    await db.order.update({ where: { id: a.order.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await inv.expireStaleOrders({ eventId });
    await checkout({ eventId, ...buyer, lines: [{ ticketTypeId: tt.id, quantity: 2 }] }); // someone else takes both
    await gateway(a.ref, "success", a.order.totalMinor);
    await webhook(a.ref);
    const p = await db.payment.findFirstOrThrow({ where: { providerReference: a.ref } });
    expect(p.status).toBe("SUCCEEDED");
    expect(p.refundRequired).toBe(true);
    expect(await ticketCount(a.order.id)).toBe(0);
    const after = await db.ticketType.findUniqueOrThrow({ where: { id: tt.id } });
    expect(after.quantitySold + after.quantityReserved).toBeLessThanOrEqual(2);
  });

  it("flags a second successful payment for the same order for refund", async () => {
    const { order, ref } = await pending(1);
    await gateway(ref, "success", order.totalMinor);
    await webhook(ref);
    const second = (await pay.startPayment(order.reference, "http://localhost:3000").catch((e) => e)) as unknown;
    expect(second).toBeInstanceOf(pay.PaymentError); // the order is already paid
    // simulate a second attempt that was opened before the first one succeeded
    const dup = await db.payment.create({ data: { orderId: order.id, provider: "mock", providerReference: `P9-dup${suffix}`, amountMinor: order.totalMinor, currency: order.currency, status: "PENDING" } });
    await gateway(dup.providerReference, "success", order.totalMinor);
    await webhook(dup.providerReference);
    expect((await db.payment.findUniqueOrThrow({ where: { id: dup.id } })).refundRequired).toBe(true);
    expect(await ticketCount(order.id)).toBe(1);
  });

  it("refunds a paid order: tickets refunded and stock restored", async () => {
    const { order, ref, tt } = await pending(2);
    await gateway(ref, "success", order.totalMinor);
    await webhook(ref);
    const payment = await db.payment.findFirstOrThrow({ where: { providerReference: ref } });
    await pay.refundPayment(orgId, payment.id);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("REFUNDED");
    expect(await db.ticket.count({ where: { orderId: order.id, status: "REFUNDED" } })).toBe(2);
    expect((await db.ticketType.findUniqueOrThrow({ where: { id: tt.id } })).quantitySold).toBe(0);
  });

  it("refuses to refund an order whose tickets were already used", async () => {
    const { order, ref } = await pending(1);
    await gateway(ref, "success", order.totalMinor);
    await webhook(ref);
    await db.ticket.updateMany({ where: { orderId: order.id }, data: { status: "USED", usedAt: new Date() } });
    const payment = await db.payment.findFirstOrThrow({ where: { providerReference: ref } });
    await expect(pay.refundPayment(orgId, payment.id)).rejects.toThrow(/already been used/);
  });
});
