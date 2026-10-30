import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;
process.env.APP_URL = "https://tickets.example";

describe.skipIf(!url)("referral codes (database)", () => {
  let ref: typeof import("@/lib/referral");
  let checkout: typeof import("@/lib/checkout").checkout;
  let outbox: typeof import("@/lib/outbox");
  let sendEmail: ReturnType<typeof vi.fn>;
  let db: typeof import("@/lib/db").db;
  const suffix = Date.now();
  let orgA: string, orgB: string, suspended: string, eventId: string;
  const buyer = { buyerName: "Ref Buyer", buyerEmail: `ref-${suffix}@test.local` };

  const order = async (referral?: string) => {
    const tt = await db.ticketType.create({ data: { eventId, name: "Free", priceMinor: 0, quantityTotal: 20 } });
    const r = await checkout({ eventId, ...buyer, lines: [{ ticketTypeId: tt.id, quantity: 1 }], referral });
    return db.order.findUniqueOrThrow({ where: { reference: r.reference } });
  };

  beforeAll(async () => {
    ref = await import("@/lib/referral");
    checkout = (await import("@/lib/checkout")).checkout;
    outbox = await import("@/lib/outbox");
    sendEmail = (await import("@/lib/email")).sendEmail as unknown as ReturnType<typeof vi.fn>;
    db = (await import("@/lib/db")).db;
    const mk = async (n: string, status: "ACTIVE" | "SUSPENDED" = "ACTIVE") => (await db.user.create({ data: { email: `${n}-${suffix}@test.local`, passwordHash: "x", role: "ORGANIZER", status } })).id;
    orgA = await mk("refa"); orgB = await mk("refb"); suspended = await mk("refs", "SUSPENDED");
    eventId = (await db.event.create({ data: { organizerId: orgA, title: "Ref", slug: `ref-${suffix}`, description: "d", status: "PUBLISHED", startsAt: new Date(Date.now() + 864e5), endsAt: new Date(Date.now() + 2 * 864e5) } })).id;
  });

  afterAll(async () => {
    await db.emailOutbox.deleteMany({ where: { to: buyer.buyerEmail } });
    await db.ticket.deleteMany({ where: { eventId } });
    await db.orderItem.deleteMany({ where: { order: { eventId } } });
    await db.order.deleteMany({ where: { eventId } });
    await db.ticketType.deleteMany({ where: { eventId } });
    await db.event.deleteMany({ where: { id: eventId } });
    await db.auditLog.deleteMany({ where: { entityType: "Order" } });
    await db.user.deleteMany({ where: { id: { in: [orgA, orgB, suspended] } } });
    await db.$disconnect();
  });

  it("gives every organizer one permanent, unique code, even under concurrency", async () => {
    const [x, y, z] = await Promise.all([ref.ensureReferralCode(orgA), ref.ensureReferralCode(orgA), ref.ensureReferralCode(orgA)]);
    expect(new Set([x, y, z]).size).toBe(1);
    expect(x).toMatch(ref.REFERRAL_RE);
    const b = await ref.ensureReferralCode(orgB);
    expect(b).not.toBe(x);
    expect(await ref.ensureReferralCode(orgA)).toBe(x);
  });

  it("records the owner's code by default and a real organizer's code from the link, never a made-up one", async () => {
    const ownerCode = await ref.ensureReferralCode(orgA);
    const bCode = await ref.ensureReferralCode(orgB);
    expect((await order()).referralCode).toBe(ownerCode);
    expect((await order(bCode.toLowerCase())).referralCode).toBe(bCode);
    expect((await order("REF-ZZZZZZ")).referralCode).toBe(ownerCode);
    expect((await order("<script>")).referralCode).toBe(ownerCode);
    const sCode = await ref.ensureReferralCode(suspended);
    expect((await order(sCode)).referralCode).toBe(ownerCode); // a suspended organizer's code is ignored
  });

  it("prints the referral code in the receipt email", async () => {
    sendEmail.mockReset().mockResolvedValue(undefined);
    const o = await order();
    await outbox.processOutbox(50);
    const mail = sendEmail.mock.calls.map((c) => c[0]).find((m) => m.to === buyer.buyerEmail && m.text.includes(o.reference));
    expect(mail).toBeTruthy();
    expect(mail.text).toContain(`Referral code: ${o.referralCode}`);
    expect(mail.html).toContain(o.referralCode!);
  });
});
