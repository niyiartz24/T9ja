import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { EventInput } from "@/lib/events";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;
const actor = (id: string) => ({ id, role: "ORGANIZER" as const });

const input = (title: string): EventInput => ({
  title, description: "A description that is comfortably longer than thirty characters.",
  venueName: "Main Hall", venueAddress: "1 Marina Road", isOnline: false, onlineUrl: null,
  timezone: "Africa/Lagos", startsAt: new Date(Date.now() + 30 * 864e5), endsAt: new Date(Date.now() + 31 * 864e5),
  salesOpenAt: null, salesCloseAt: null, coverImage: null,
});

describe.skipIf(!url)("event service (database)", () => {
  let svc: typeof import("@/lib/event-service");
  let db: typeof import("@/lib/db").db;
  let orgA: string, orgB: string, eventA: string;
  const suffix = Date.now();

  beforeAll(async () => {
    svc = await import("@/lib/event-service");
    db = (await import("@/lib/db")).db;
    const mk = (n: string) => db.user.create({ data: { email: `${n}-${suffix}@test.local`, passwordHash: "x", role: "ORGANIZER" } });
    orgA = (await mk("a")).id;
    orgB = (await mk("b")).id;
    eventA = (await svc.createEvent(actor(orgA), input("Isolation Test Event"))).id;
  });

  afterAll(async () => {
    const events = await db.event.findMany({ where: { organizerId: { in: [orgA, orgB] } }, select: { id: true } });
    const ids = events.map((e) => e.id);
    await db.auditLog.deleteMany({ where: { OR: [{ entityId: { in: ids } }, { actorId: { in: [orgA, orgB] } }] } });
    await db.ticketType.deleteMany({ where: { eventId: { in: ids } } });
    await db.event.deleteMany({ where: { id: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: [orgA, orgB] } } });
    await db.$disconnect();
  });

  it("gives colliding titles distinct slugs", async () => {
    const a = await svc.createEvent(actor(orgA), input("Same Title"));
    const b = await svc.createEvent(actor(orgB), input("Same Title"));
    expect(a.slug).not.toBe(b.slug);
  });

  it("hides one organizer's events from another on every operation", async () => {
    await expect(svc.getOwnedEvent(actor(orgB), eventA)).rejects.toThrow(/not found/i);
    await expect(svc.updateEvent(actor(orgB), eventA, input("Hijacked"))).rejects.toThrow(/not found/i);
    await expect(svc.publishEvent(actor(orgB), eventA)).rejects.toThrow(/not found/i);
    await expect(svc.unpublishEvent(actor(orgB), eventA)).rejects.toThrow(/not found/i);
    await expect(svc.cancelEvent(actor(orgB), eventA)).rejects.toThrow(/not found/i);
    expect((await svc.listOwnedEvents(actor(orgB))).some((e) => e.id === eventA)).toBe(false);
    expect((await svc.getOwnedEvent(actor(orgA), eventA)).title).toBe("Isolation Test Event");
  });

  it("blocks publishing without an active ticket type, then allows it", async () => {
    await expect(svc.publishEvent(actor(orgA), eventA)).rejects.toThrow(/ticket type/i);
    await db.ticketType.create({ data: { eventId: eventA, name: "Regular", priceMinor: 0, quantityTotal: 10 } });
    await svc.publishEvent(actor(orgA), eventA);
    expect((await svc.getOwnedEvent(actor(orgA), eventA)).status).toBe("PUBLISHED");
  });

  it("keeps a published event complete when editing", async () => {
    await expect(svc.updateEvent(actor(orgA), eventA, { ...input("Isolation Test Event"), description: "short" })).rejects.toThrow(/complete/i);
  });

  it("cancels without deleting data and then refuses edits", async () => {
    await svc.cancelEvent(actor(orgA), eventA);
    const e = await svc.getOwnedEvent(actor(orgA), eventA);
    expect(e.status).toBe("CANCELLED");
    expect(e.ticketTypes).toHaveLength(1);
    await expect(svc.updateEvent(actor(orgA), eventA, input("Edit after cancel"))).rejects.toThrow(/cannot be edited/i);
  });
});
