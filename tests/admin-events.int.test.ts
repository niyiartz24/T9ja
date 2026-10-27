import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { EventInput } from "@/lib/events";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

const input = (title: string): EventInput => ({
  title, description: "A description that is comfortably longer than thirty characters.",
  venueName: "Main Hall", venueAddress: "1 Marina Road", isOnline: false, onlineUrl: null,
  timezone: "Africa/Lagos", startsAt: new Date(Date.now() + 30 * 864e5), endsAt: new Date(Date.now() + 31 * 864e5),
  salesOpenAt: null, salesCloseAt: null, coverImage: null,
});
const ticket = { name: "Regular", description: null, priceMinor: 0, currency: "NGN", quantityTotal: 10, minPerOrder: 1, maxPerOrder: 5, salesOpenAt: null, salesCloseAt: null, isActive: true };

describe.skipIf(!url)("Super Admin event access (database)", () => {
  let svc: typeof import("@/lib/event-service");
  let tts: typeof import("@/lib/ticket-type-service");
  let db: typeof import("@/lib/db").db;
  let admin: { id: string; role: "SUPER_ADMIN" }, orgA: { id: string; role: "ORGANIZER" }, orgB: { id: string; role: "ORGANIZER" };
  const suffix = Date.now();

  beforeAll(async () => {
    svc = await import("@/lib/event-service");
    tts = await import("@/lib/ticket-type-service");
    db = (await import("@/lib/db")).db;
    const mk = async (n: string, role: "SUPER_ADMIN" | "ORGANIZER" | "STAFF") => (await db.user.create({ data: { email: `${n}-${suffix}@test.local`, passwordHash: "x", role } })).id;
    admin = { id: await mk("adm", "SUPER_ADMIN"), role: "SUPER_ADMIN" };
    orgA = { id: await mk("oa", "ORGANIZER"), role: "ORGANIZER" };
    orgB = { id: await mk("ob", "ORGANIZER"), role: "ORGANIZER" };
  });

  afterAll(async () => {
    const ids = (await db.event.findMany({ where: { organizerId: { in: [admin.id, orgA.id, orgB.id] } }, select: { id: true } })).map((e) => e.id);
    await db.auditLog.deleteMany({ where: { OR: [{ entityId: { in: ids } }, { actorId: { in: [admin.id, orgA.id, orgB.id] } }, { entityType: "TicketType" }] } });
    await db.ticketType.deleteMany({ where: { eventId: { in: ids } } });
    await db.event.deleteMany({ where: { id: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: [admin.id, orgA.id, orgB.id] } } });
    await db.$disconnect();
  });

  it("lets the admin create an event for an organizer, or for themselves", async () => {
    const forOrg = await svc.createEvent(admin, input("Admin made for A"), orgA.id);
    expect(forOrg.organizerId).toBe(orgA.id);
    const own = await svc.createEvent(admin, input("Admin own event"));
    expect(own.organizerId).toBe(admin.id);
    await expect(svc.createEvent(admin, input("Bad owner"), "no-such-user")).rejects.toThrow(/not found/i);
  });

  it("ignores an organizer's attempt to create an event for someone else", async () => {
    const e = await svc.createEvent(orgA, input("Sneaky"), orgB.id);
    expect(e.organizerId).toBe(orgA.id);
  });

  it("gives the admin full access to any organizer's event, and keeps organizers apart", async () => {
    const e = await svc.createEvent(orgA, input("Organizer A event"));
    expect((await svc.getOwnedEvent(admin, e.id)).organizer.id).toBe(orgA.id);
    expect((await svc.listOwnedEvents(admin)).some((x) => x.id === e.id)).toBe(true);
    await svc.updateEvent(admin, e.id, input("Edited by admin"));
    await tts.createTicketType(admin, e.id, ticket);
    await svc.publishEvent(admin, e.id);
    expect((await svc.getOwnedEvent(orgA, e.id)).status).toBe("PUBLISHED");
    await expect(svc.getOwnedEvent(orgB, e.id)).rejects.toThrow(/not found/i);
    await svc.cancelEvent(admin, e.id);
    expect((await svc.getOwnedEvent(orgA, e.id)).status).toBe("CANCELLED");
  });

  it("refuses staff accounts", async () => {
    const staff = { id: "x", role: "STAFF" as const };
    expect(() => svc.listOwnedEvents(staff)).toThrow(/permission/i);
    await expect(svc.createEvent(staff, input("Nope"))).rejects.toThrow(/permission/i);
  });
});
