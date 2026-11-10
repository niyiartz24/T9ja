import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

describe.skipIf(!url)("organizers see their own buyers and nobody else's (database)", () => {
  let svc: typeof import("@/lib/event-service");
  let collab: typeof import("@/lib/collaborator-service");
  let checkout: typeof import("@/lib/checkout").checkout;
  let db: typeof import("@/lib/db").db;
  const suffix = Date.now();
  type A = { id: string; role: "SUPER_ADMIN" | "ORGANIZER" };
  let admin: A, orgA: A, orgB: A, orgC: A;
  let evA: string, evB: string;
  const emails: Record<string, string> = {};

  const mk = async (n: string, role: A["role"]): Promise<A> => {
    emails[n] = `${n}-${suffix}@test.local`;
    return { id: (await db.user.create({ data: { email: emails[n], passwordHash: "x", role } })).id, role };
  };
  const buy = async (eventId: string, name: string) => {
    const tt = await db.ticketType.create({ data: { eventId, name: "Free", priceMinor: 0, quantityTotal: 20 } });
    return checkout({ eventId, buyerName: name, buyerEmail: `${name.toLowerCase()}-${suffix}@buyer.local`, lines: [{ ticketTypeId: tt.id, quantity: 1 }] });
  };
  const orderNames = async (a: A) => (await db.order.findMany({ where: { event: svc.scope(a) }, select: { buyerName: true } })).map((o) => o.buyerName).sort();
  const ticketHolders = async (a: A) => (await db.ticket.findMany({ where: { event: svc.scope(a) }, select: { holderName: true } })).map((t) => t.holderName).sort();

  beforeAll(async () => {
    svc = await import("@/lib/event-service");
    collab = await import("@/lib/collaborator-service");
    checkout = (await import("@/lib/checkout")).checkout;
    db = (await import("@/lib/db")).db;
    admin = await mk("odadm", "SUPER_ADMIN"); orgA = await mk("odA", "ORGANIZER"); orgB = await mk("odB", "ORGANIZER"); orgC = await mk("odC", "ORGANIZER");
    const input = { title: "x", description: "A description that is comfortably longer than thirty characters.", venueName: "Hall", venueAddress: "1 Road", isOnline: false, onlineUrl: null, timezone: "Africa/Lagos", startsAt: new Date(Date.now() + 864e5), endsAt: new Date(Date.now() + 2 * 864e5), salesOpenAt: null, salesCloseAt: null, coverImage: null };
    evA = (await svc.createEvent(orgA, { ...input, title: "Event A" })).id;
    evB = (await svc.createEvent(orgB, { ...input, title: "Event B" })).id;
    await db.event.updateMany({ where: { id: { in: [evA, evB] } }, data: { status: "PUBLISHED" } });
    await buy(evA, "BuyerOfA");
    await buy(evB, "BuyerOfB");
  });

  afterAll(async () => {
    const ids = [evA, evB];
    await db.emailOutbox.deleteMany({ where: { to: { contains: `-${suffix}@buyer.local` } } });
    await db.ticket.deleteMany({ where: { eventId: { in: ids } } });
    await db.orderItem.deleteMany({ where: { order: { eventId: { in: ids } } } });
    await db.order.deleteMany({ where: { eventId: { in: ids } } });
    await db.ticketType.deleteMany({ where: { eventId: { in: ids } } });
    await db.eventOrganizer.deleteMany({ where: { eventId: { in: ids } } });
    await db.event.deleteMany({ where: { id: { in: ids } } });
    await db.auditLog.deleteMany({ where: { OR: [{ entityId: { in: ids } }, { entityType: "Order" }] } });
    await db.user.deleteMany({ where: { email: { contains: `-${suffix}@test.local` } } });
    await db.$disconnect();
  });

  it("shows each organizer only the buyers and ticket holders of their own events", async () => {
    expect(await orderNames(orgA)).toEqual(["BuyerOfA"]);
    expect(await orderNames(orgB)).toEqual(["BuyerOfB"]);
    expect(await orderNames(orgC)).toEqual([]);
    expect(await ticketHolders(orgA)).toEqual(["BuyerOfA"]);
    expect(await ticketHolders(orgC)).toEqual([]);
  });

  it("shows the Super Admin everything", async () => {
    const names = await orderNames(admin);
    expect(names).toContain("BuyerOfA");
    expect(names).toContain("BuyerOfB");
  });

  it("extends visibility to an organizer added to an event, and takes it away when they are removed", async () => {
    await collab.addCollaborator(orgA, evA, emails.odC);
    expect(await orderNames(orgC)).toEqual(["BuyerOfA"]);
    expect(await ticketHolders(orgC)).toEqual(["BuyerOfA"]);
    await collab.removeCollaborator(orgA, evA, orgC.id);
    expect(await orderNames(orgC)).toEqual([]);
  });
});
