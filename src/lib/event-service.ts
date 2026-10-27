import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { publishProblems, slugify, type EventInput } from "@/lib/events";

export class EventError extends Error {}

export type Actor = { id: string; role: "SUPER_ADMIN" | "ORGANIZER" | "STAFF" };

const NOT_FOUND = "Event not found.";

/**
 * The single authorization rule for events: Super Admins see every event,
 * organizers only their own. A foreign id is indistinguishable from a missing one.
 */
export const scope = (a: Actor): Prisma.EventWhereInput => (a.role === "SUPER_ADMIN" ? {} : { organizerId: a.id });

function assertManager(a: Actor) {
  if (a.role !== "SUPER_ADMIN" && a.role !== "ORGANIZER") throw new EventError("You do not have permission to manage events.");
}

export async function getOwnedEvent(actor: Actor, id: string) {
  assertManager(actor);
  const event = await db.event.findFirst({
    where: { id, ...scope(actor) },
    include: { ticketTypes: true, organizer: { select: { id: true, email: true, name: true } } },
  });
  if (!event) throw new EventError(NOT_FOUND);
  return event;
}

export function listOwnedEvents(actor: Actor) {
  assertManager(actor);
  return db.event.findMany({
    where: scope(actor),
    orderBy: { startsAt: "desc" },
    take: 200,
    include: { _count: { select: { orders: true } }, organizer: { select: { email: true, name: true } } },
  });
}

/** Super Admins may create an event on behalf of an organizer (ownerId). Organizers always own what they create. */
export async function createEvent(actor: Actor, input: EventInput, ownerId?: string) {
  assertManager(actor);
  let owner = actor.id;
  if (actor.role === "SUPER_ADMIN" && ownerId && ownerId !== actor.id) {
    const target = await db.user.findFirst({
      where: { id: ownerId, status: "ACTIVE", role: { in: ["ORGANIZER", "SUPER_ADMIN"] } },
      select: { id: true },
    });
    if (!target) throw new EventError("The selected organizer was not found.");
    owner = target.id;
  }
  const base = slugify(input.title);
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${randomBytes(3).toString("hex")}`;
    try {
      return await db.$transaction(async (tx) => {
        const event = await tx.event.create({ data: { ...input, slug, organizerId: owner } });
        await tx.auditLog.create({
          data: { actorId: actor.id, action: "event.create", entityType: "Event", entityId: event.id, metadata: { role: actor.role, owner } },
        });
        return event;
      });
    } catch (e) {
      const slugTaken = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
      if (!slugTaken) throw e;
    }
  }
  throw new EventError("Could not generate a unique URL for this event. Try a different title.");
}

export async function updateEvent(actor: Actor, id: string, input: EventInput) {
  assertManager(actor);
  return db.$transaction(async (tx) => {
    const current = await tx.event.findFirst({ where: { id, ...scope(actor) } });
    if (!current) throw new EventError(NOT_FOUND);
    if (current.status !== "DRAFT" && current.status !== "PUBLISHED") {
      throw new EventError("Cancelled or completed events cannot be edited.");
    }
    if (current.status === "PUBLISHED") {
      const active = await tx.ticketType.count({ where: { eventId: id, isActive: true } });
      const problems = publishProblems(input, active);
      if (problems.length) throw new EventError(`A published event must stay complete: ${problems.join("; ")}.`);
    }
    // slug is deliberately never updated: public URLs stay stable
    const event = await tx.event.update({ where: { id }, data: input });
    await tx.auditLog.create({ data: { actorId: actor.id, action: "event.update", entityType: "Event", entityId: id, metadata: { role: actor.role } } });
    return event;
  });
}

export async function publishEvent(actor: Actor, id: string) {
  assertManager(actor);
  return db.$transaction(async (tx) => {
    const event = await tx.event.findFirst({ where: { id, ...scope(actor) } });
    if (!event) throw new EventError(NOT_FOUND);
    if (event.status !== "DRAFT") throw new EventError("Only draft events can be published.");
    const active = await tx.ticketType.count({ where: { eventId: id, isActive: true } });
    const problems = publishProblems(event, active);
    if (problems.length) throw new EventError(`Cannot publish yet: ${problems.join("; ")}.`);
    const r = await tx.event.updateMany({
      where: { id, ...scope(actor), status: "DRAFT" },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    if (r.count !== 1) throw new EventError("Only draft events can be published.");
    await tx.auditLog.create({ data: { actorId: actor.id, action: "event.publish", entityType: "Event", entityId: id, metadata: { role: actor.role } } });
  });
}

export async function unpublishEvent(actor: Actor, id: string) {
  assertManager(actor);
  return db.$transaction(async (tx) => {
    const event = await tx.event.findFirst({ where: { id, ...scope(actor) } });
    if (!event) throw new EventError(NOT_FOUND);
    if (event.status !== "PUBLISHED") throw new EventError("Only published events can be unpublished.");
    if (await tx.order.count({ where: { eventId: id } })) {
      throw new EventError("This event already has orders. Cancel it instead of unpublishing.");
    }
    await tx.event.updateMany({ where: { id, ...scope(actor), status: "PUBLISHED" }, data: { status: "DRAFT", publishedAt: null } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: "event.unpublish", entityType: "Event", entityId: id, metadata: { role: actor.role } } });
  });
}

/** Cancelling never deletes orders, payments or tickets. */
export async function cancelEvent(actor: Actor, id: string) {
  assertManager(actor);
  return db.$transaction(async (tx) => {
    const r = await tx.event.updateMany({
      where: { id, ...scope(actor), status: { in: ["DRAFT", "PUBLISHED"] } },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    if (r.count !== 1) {
      const exists = await tx.event.findFirst({ where: { id, ...scope(actor) } });
      throw new EventError(exists ? "This event can no longer be cancelled." : NOT_FOUND);
    }
    await tx.auditLog.create({ data: { actorId: actor.id, action: "event.cancel", entityType: "Event", entityId: id, metadata: { role: actor.role } } });
  });
}
