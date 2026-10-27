import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

describe.skipIf(!url)("scanner (database)", () => {
  let scanner: typeof import("@/lib/scanner");
  let staffSvc: typeof import("@/lib/staff-service");
  let checkout: typeof import("@/lib/checkout").checkout;
  let db: typeof import("@/lib/db").db;
  const suffix = Date.now();
  let admin: { id: string; role: "SUPER_ADMIN" }, org: { id: string; role: "ORGANIZER" }, otherOrg: { id: string; role: "ORGANIZER" };
  let staff: { id: string; role: "STAFF" }, outsider: { id: string; role: "STAFF" };
  let eventId: string, otherEventId: string;

  const mkType = (eid = eventId) => db.ticketType.create({ data: { eventId: eid, name: "Free", priceMinor: 0, quantityTotal: 50 } });
  async function ticketsFor(qty: number, eid = eventId) {
    const tt = await mkType(eid);
    const r = await checkout({ eventId: eid, buyerName: "Door Test", buyerEmail: "door@test.local", lines: [{ ticketTypeId: tt.id, quantity: qty }] });
    const order = await db.order.findUniqueOrThrow({ where: { reference: r.reference }, include: { tickets: true } });
    return order.tickets;
  }
  const mkEvent = (organizerId: string, slug: string) =>
    db.event.create({ data: { organizerId, title: slug, slug: `${slug}-${suffix}`, description: "d", status: "PUBLISHED", startsAt: new Date(Date.now() + 864e5), endsAt: new Date(Date.now() + 2 * 864e5) } });

  beforeAll(async () => {
    scanner = await import("@/lib/scanner");
    staffSvc = await import("@/lib/staff-service");
    checkout = (await import("@/lib/checkout")).checkout;
    db = (await import("@/lib/db")).db;
    const mk = async (n: string, role: "SUPER_ADMIN" | "ORGANIZER" | "STAFF") => (await db.user.create({ data: { email: `${n}-${suffix}@test.local`, passwordHash: "x", role } })).id;
    admin = { id: await mk("sadm", "SUPER_ADMIN"), role: "SUPER_ADMIN" };
    org = { id: await mk("sorg", "ORGANIZER"), role: "ORGANIZER" };
    otherOrg = { id: await mk("sorg2", "ORGANIZER"), role: "ORGANIZER" };
    staff = { id: await mk("sstaff", "STAFF"), role: "STAFF" };
    outsider = { id: await mk("sout", "STAFF"), role: "STAFF" };
    eventId = (await mkEvent(org.id, "scan-a")).id;
    otherEventId = (await mkEvent(otherOrg.id, "scan-b")).id;
    await db.eventStaff.create({ data: { eventId, userId: staff.id } });
  });

  afterAll(async () => {
    const ids = [eventId, otherEventId];
    const users = [admin.id, org.id, otherOrg.id, staff.id, outsider.id];
    await db.ticketScan.deleteMany({ where: { eventId: { in: ids } } });
    await db.ticket.deleteMany({ where: { eventId: { in: ids } } });
    await db.emailOutbox.deleteMany({ where: { to: "door@test.local" } });
    await db.orderItem.deleteMany({ where: { order: { eventId: { in: ids } } } });
    await db.order.deleteMany({ where: { eventId: { in: ids } } });
    await db.ticketType.deleteMany({ where: { eventId: { in: ids } } });
    await db.eventStaff.deleteMany({ where: { eventId: { in: ids } } });
    await db.event.deleteMany({ where: { id: { in: ids } } });
    await db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: users } }, { entityType: "Order" }] } });
    await db.session.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { email: { contains: `-${suffix}@test.local` } } });
    await db.$disconnect();
  });

  it("admits a valid ticket once and rejects the second scan", async () => {
    const [t] = await ticketsFor(1);
    const first = await scanner.scanTicket(staff, eventId, t.qrToken);
    expect(first.outcome).toBe("ADMITTED");
    expect((await db.ticket.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("USED");
    const second = await scanner.scanTicket(staff, eventId, t.qrToken);
    expect(second.outcome).toBe("DUPLICATE");
    const byCode = await scanner.scanTicket(staff, eventId, t.code.toLowerCase());
    expect(byCode.outcome).toBe("DUPLICATE");
    expect(await db.ticketScan.count({ where: { ticketId: t.id, result: "ADMITTED" } })).toBe(1);
  });

  it("admits exactly one of many simultaneous scans of the same ticket", async () => {
    const [t] = await ticketsFor(1);
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => scanner.scanTicket(i % 2 ? staff : admin, eventId, t.qrToken)));
    expect(results.filter((r) => r.outcome === "ADMITTED")).toHaveLength(1);
    expect(results.filter((r) => r.outcome === "DUPLICATE")).toHaveLength(9);
    expect(await db.ticketScan.count({ where: { ticketId: t.id, result: "ADMITTED" } })).toBe(1);
  });

  it("rejects wrong-event, unknown and malformed codes, and records them", async () => {
    const [other] = await ticketsFor(1, otherEventId);
    expect((await scanner.scanTicket(admin, eventId, other.qrToken)).outcome).toBe("WRONG_EVENT");
    expect((await db.ticket.findUniqueOrThrow({ where: { id: other.id } })).status).toBe("VALID");
    expect((await scanner.scanTicket(admin, eventId, "Z".repeat(32))).outcome).toBe("NOT_FOUND");
    expect((await scanner.scanTicket(admin, eventId, "garbage!")).outcome).toBe("NOT_FOUND");
    expect(await db.ticketScan.count({ where: { eventId, result: "NOT_FOUND" } })).toBeGreaterThanOrEqual(2);
  });

  it("rejects refunded, cancelled and unpaid tickets", async () => {
    const [a, b, c] = await ticketsFor(3);
    await db.ticket.update({ where: { id: a.id }, data: { status: "REFUNDED" } });
    await db.ticket.update({ where: { id: b.id }, data: { status: "CANCELLED" } });
    expect((await scanner.scanTicket(admin, eventId, a.qrToken)).outcome).toBe("INVALID_STATUS");
    expect((await scanner.scanTicket(admin, eventId, b.qrToken)).outcome).toBe("INVALID_STATUS");
    await db.order.update({ where: { id: c.orderId }, data: { status: "PENDING" } });
    expect((await scanner.scanTicket(admin, eventId, c.qrToken)).outcome).toBe("INVALID_STATUS");
    expect((await db.ticket.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("VALID");
  });

  it("rejects everything for a cancelled event", async () => {
    const e = await mkEvent(org.id, "scan-cancel");
    const [t] = await ticketsFor(1, e.id);
    await db.event.update({ where: { id: e.id }, data: { status: "CANCELLED" } });
    expect((await scanner.scanTicket(admin, e.id, t.qrToken)).outcome).toBe("INVALID_STATUS");
    await db.ticketScan.deleteMany({ where: { eventId: e.id } });
    await db.ticket.deleteMany({ where: { eventId: e.id } });
    await db.orderItem.deleteMany({ where: { order: { eventId: e.id } } });
    await db.order.deleteMany({ where: { eventId: e.id } });
    await db.ticketType.deleteMany({ where: { eventId: e.id } });
    await db.event.delete({ where: { id: e.id } });
  });

  it("blocks unauthorized scanners", async () => {
    const [t] = await ticketsFor(1);
    await expect(scanner.scanTicket(outsider, eventId, t.qrToken)).rejects.toBeInstanceOf(scanner.ScanAuthError);
    await expect(scanner.scanTicket(otherOrg, eventId, t.qrToken)).rejects.toBeInstanceOf(scanner.ScanAuthError);
    await expect(scanner.scanTicket({ id: "x", role: "STAFF" }, eventId, t.qrToken)).rejects.toBeInstanceOf(scanner.ScanAuthError);
    expect((await db.ticket.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("VALID");
    expect((await scanner.scanTicket(org, eventId, t.qrToken)).outcome).toBe("ADMITTED"); // the event's own organizer
  });

  it("keeps scan history private to authorized users", async () => {
    expect((await scanner.recentScans(admin, eventId)).length).toBeGreaterThan(0);
    await expect(scanner.recentScans(outsider, eventId)).rejects.toBeInstanceOf(scanner.ScanAuthError);
  });

  it("creates scanner logins scoped to the organizer's own events", async () => {
    const created = await staffSvc.addScannerStaff(org, eventId, `new-${suffix}@test.local`, "Door One");
    expect(created.password).toMatch(/^[A-Za-z0-9_-]{12}$/);
    const user = await db.user.findUniqueOrThrow({ where: { email: created.email } });
    expect(user.role).toBe("STAFF");
    expect(user.passwordHash).not.toContain(created.password!);
    await expect(staffSvc.addScannerStaff(otherOrg, eventId, `x-${suffix}@test.local`, "")).rejects.toThrow(/not found/i);
    await expect(staffSvc.addScannerStaff(org, eventId, `sorg2-${suffix}@test.local`, "")).rejects.toThrow(/non-staff/i);
    await expect(staffSvc.listScannerStaff(otherOrg, eventId)).rejects.toThrow(/not found/i);
    const reset = await staffSvc.resetScannerPassword(org, eventId, user.id);
    expect(reset.password).not.toBe(created.password);
    await staffSvc.removeScannerStaff(org, eventId, user.id);
    expect(await db.eventStaff.count({ where: { eventId, userId: user.id } })).toBe(0);
  });
});
