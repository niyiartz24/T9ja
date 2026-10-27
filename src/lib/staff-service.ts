import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { EventError, scope, type Actor } from "@/lib/event-service";
import { hashPassword } from "@/lib/password";

function assertManager(a: Actor) {
  if (a.role !== "SUPER_ADMIN" && a.role !== "ORGANIZER") throw new EventError("You do not have permission to manage scanner staff.");
}

const newPassword = () => randomBytes(9).toString("base64url"); // 12 characters, shown once

async function ownedEvent(actor: Actor, eventId: string) {
  assertManager(actor);
  const e = await db.event.findFirst({ where: { id: eventId, ...scope(actor) }, select: { id: true } });
  if (!e) throw new EventError("Event not found.");
}

export async function listScannerStaff(actor: Actor, eventId: string) {
  await ownedEvent(actor, eventId);
  const rows = await db.eventStaff.findMany({ where: { eventId }, include: { user: { select: { id: true, email: true, name: true, status: true, role: true } } }, orderBy: { id: "asc" } });
  return rows.map((r) => r.user);
}

/** Creates a door-staff login (STAFF role: can scan only the events they are assigned to) or assigns an existing one. */
export async function addScannerStaff(actor: Actor, eventId: string, email: string, name: string) {
  await ownedEvent(actor, eventId);
  const addr = email.trim().toLowerCase();
  const existing = await db.user.findUnique({ where: { email: addr } });
  if (existing && existing.role !== "STAFF") throw new EventError("That email already belongs to a non-staff account.");
  return db.$transaction(async (tx) => {
    let user = existing;
    let password: string | null = null;
    if (!user) {
      const fresh = newPassword();
      password = fresh;
      user = await tx.user.create({ data: { email: addr, name: name.trim() || null, passwordHash: await hashPassword(fresh), role: "STAFF", emailVerified: new Date() } });
    }
    await tx.eventStaff.createMany({ data: [{ eventId, userId: user.id }], skipDuplicates: true });
    await tx.auditLog.create({ data: { actorId: actor.id, action: "staff.assign", entityType: "Event", entityId: eventId, metadata: { staffId: user.id } } });
    return { email: user.email, password };
  });
}

export async function removeScannerStaff(actor: Actor, eventId: string, userId: string) {
  await ownedEvent(actor, eventId);
  await db.eventStaff.deleteMany({ where: { eventId, userId } });
  await db.auditLog.create({ data: { actorId: actor.id, action: "staff.remove", entityType: "Event", entityId: eventId, metadata: { staffId: userId } } });
}

export async function resetScannerPassword(actor: Actor, eventId: string, userId: string) {
  await ownedEvent(actor, eventId);
  const assigned = await db.eventStaff.findUnique({ where: { eventId_userId: { eventId, userId } }, include: { user: { select: { role: true, email: true } } } });
  if (!assigned || assigned.user.role !== "STAFF") throw new EventError("Staff member not found.");
  const password = newPassword();
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(password) } }),
    db.session.deleteMany({ where: { userId } }),
    db.auditLog.create({ data: { actorId: actor.id, action: "staff.reset_password", entityType: "User", entityId: userId } }),
  ]);
  return { email: assigned.user.email, password };
}
