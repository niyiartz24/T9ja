import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;
process.env.PAYMENT_PROVIDER = "manual";
process.env.PAYMENT_ALERT_EMAIL = "alerts@test.local";

describe.skipIf(!url)("manual bank transfer payments (database)", () => {
  let pay: typeof import("@/lib/payments/service");
  let manual: typeof import("@/lib/payments/manual-service");
  let inv: typeof import("@/lib/inventory");
  let checkout: typeof import("@/lib/checkout").checkout;
  let db: typeof import("@/lib/db").db;
  let orgId: string, eventId: string;
  const suffix = Date.now();
  let adminId: string;
  const buyer = { buyerName: "Transfer Buyer", buyerEmail: "transfer@test.local" };

  const mkType = (quantityTotal: number) => db.ticketType.create({ data: { eventId, name: `T${Math.random()}`, priceMinor: 500000, quantityTotal } });
  async function started(qty: number, typeId?: string) {
    const tt = typeId ? await db.ticketType.findUniqueOrThrow({ where: { id: typeId } }) : await mkType(10);
    const r = await checkout({ eventId, ...buyer, lines: [{ ticketTypeId: tt.id, quantity: qty }] });
    const order = await db.order.findUniqueOrThrow({ where: { reference: r.reference } });
    await pay.startPayment(order.reference, "http://localhost:3000");
    const payment = await db.payment.findFirstOrThrow({ where: { orderId: order.id } });
    return { order, payment, tt };
  }
  const tickets = (orderId: string) => db.ticket.count({ where: { orderId } });

  beforeAll(async () => {
    pay = await import("@/lib/payments/service");
    manual = await import("@/lib/payments/manual-service");
    inv = await import("@/lib/inventory");
    checkout = (await import("@/lib/checkout")).checkout;
    db = (await import("@/lib/db")).db;
    orgId = (await db.user.create({ data: { email: `man-${suffix}@test.local`, passwordHash: "x", role: "ORGANIZER" } })).id;
    adminId = (await db.user.create({ data: { email: `mana-${suffix}@test.local`, passwordHash: "x", role: "SUPER_ADMIN" } })).id;
    eventId = (await db.event.create({ data: { organizerId: orgId, title: "Manual", slug: `manual-${suffix}`, description: "d", status: "PUBLISHED", startsAt: new Date(Date.now() + 30 * 864e5), endsAt: new Date(Date.now() + 31 * 864e5) } })).id;
  });

  afterAll(async () => {
    await db.emailOutbox.deleteMany({ where: { OR: [{ to: buyer.buyerEmail }, { to: "alerts@test.local" }] } });
    await db.payment.deleteMany({ where: { order: { eventId } } });
    await db.ticket.deleteMany({ where: { eventId } });
    await db.orderItem.deleteMany({ where: { order: { eventId } } });
    await db.order.deleteMany({ where: { eventId } });
    await db.ticketType.deleteMany({ where: { eventId } });
    await db.event.deleteMany({ where: { id: eventId } });
    await db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: [orgId, adminId] } }, { entityType: { in: ["Order", "Payment"] } }] } });
    await db.user.deleteMany({ where: { id: { in: [orgId, adminId] } } });
    await db.$disconnect();
  });

  it("shows the bank details once per order and reuses the open attempt", async () => {
    const { order, payment } = await started(1);
    const meta = payment.meta as { instructions: { accountNumber: string; bankName: string; narration: string; amountMinor: number } };
    expect(meta.instructions).toMatchObject({ accountNumber: "1048926078", bankName: "VFD MFB", narration: order.reference, amountMinor: order.totalMinor });
    await pay.startPayment(order.reference, "http://localhost:3000");
    expect(await db.payment.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("holds the stock and alerts the admin once when the customer reports a transfer", async () => {
    const { order, payment } = await started(1);
    await manual.claimTransfer(order.reference, "Ada Okoro", "GTBank 2pm");
    await manual.claimTransfer(order.reference, "Ada Okoro", "again");
    const after = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(after.claimedAt).not.toBeNull();
    expect((after.meta as { claim: { senderName: string } }).claim.senderName).toBe("Ada Okoro");
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).expiresAt!.getTime()).toBeGreaterThan(Date.now() + 20 * 3600_000);
    expect(await db.emailOutbox.count({ where: { dedupeKey: `payment-claim:${payment.id}` } })).toBe(1);
  });

  it("a customer's claim alone never issues tickets, and webhooks are refused", async () => {
    const { order, payment } = await started(2);
    await manual.claimTransfer(order.reference, "Ada", "");
    expect(await pay.finalizePayment(payment.id)).toBe("pending");
    expect(await tickets(order.id)).toBe(0);
    await expect(pay.processWebhook("manual", "{}", new Headers())).rejects.toBeInstanceOf(pay.WebhookAuthError);
  });

  it("admin confirmation issues tickets once and queues the ticket email", async () => {
    const { order, payment, tt } = await started(3);
    await manual.claimTransfer(order.reference, "Ada", "");
    expect(await manual.confirmManualPayment(adminId, payment.id, order.totalMinor)).toBe("issued");
    expect(await tickets(order.id)).toBe(3);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PAID");
    expect((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("SUCCEEDED");
    const after = await db.ticketType.findUniqueOrThrow({ where: { id: tt.id } });
    expect([after.quantitySold, after.quantityReserved]).toEqual([3, 0]);
    expect(await db.emailOutbox.count({ where: { dedupeKey: `order-tickets:${order.id}` } })).toBe(1);
    await expect(manual.confirmManualPayment(adminId, payment.id, order.totalMinor)).rejects.toThrow(/already been handled/);
  });

  it("simultaneous confirmations still issue one set of tickets", async () => {
    const { order, payment } = await started(2);
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => manual.confirmManualPayment(adminId, payment.id, order.totalMinor)));
    expect(results.filter((r) => r.status === "fulfilled" && r.value === "issued")).toHaveLength(1);
    expect(await tickets(order.id)).toBe(2);
  });

  it("sends a wrong amount to review and issues nothing", async () => {
    const { order, payment } = await started(1);
    expect(await manual.confirmManualPayment(adminId, payment.id, order.totalMinor - 100)).toBe("review");
    expect((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("REVIEW");
    expect(await tickets(order.id)).toBe(0);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING");
  });

  it("marks a rejected transfer failed and lets the customer start again", async () => {
    const { order, payment } = await started(1);
    expect(await manual.rejectManualPayment(adminId, payment.id)).toBe("failed");
    expect((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("FAILED");
    await pay.startPayment(order.reference, "http://localhost:3000");
    expect(await db.payment.count({ where: { orderId: order.id } })).toBe(2);
  });

  it("honours a confirmation after the hold expired when stock remains, and flags a refund when it does not", async () => {
    const a = await started(2);
    await db.order.update({ where: { id: a.order.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await inv.expireStaleOrders({ eventId });
    expect(await manual.confirmManualPayment(adminId, a.payment.id, a.order.totalMinor)).toBe("issued");
    expect(await tickets(a.order.id)).toBe(2);

    const tt = await mkType(2);
    const b = await started(2, tt.id);
    await db.order.update({ where: { id: b.order.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await inv.expireStaleOrders({ eventId });
    await checkout({ eventId, ...buyer, lines: [{ ticketTypeId: tt.id, quantity: 2 }] }); // someone else takes the stock
    expect(await manual.confirmManualPayment(adminId, b.payment.id, b.order.totalMinor)).toBe("refund_required");
    expect(await tickets(b.order.id)).toBe(0);
    expect((await db.payment.findUniqueOrThrow({ where: { id: b.payment.id } })).refundRequired).toBe(true);
  });

  it("records a refund for a paid manual payment: tickets refunded, stock restored", async () => {
    const { order, payment, tt } = await started(2);
    await manual.confirmManualPayment(adminId, payment.id, order.totalMinor);
    await pay.refundPayment(orgId, payment.id);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("REFUNDED");
    expect(await db.ticket.count({ where: { orderId: order.id, status: "REFUNDED" } })).toBe(2);
    expect((await db.ticketType.findUniqueOrThrow({ where: { id: tt.id } })).quantitySold).toBe(0);
  });
});
