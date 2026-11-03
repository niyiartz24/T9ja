import { db } from "@/lib/db";
import { enqueueEmail } from "@/lib/outbox";
import { EventError, scope, type Actor } from "@/lib/event-service";

function assertManager(a: Actor) {
  if (a.role !== "SUPER_ADMIN" && a.role !== "ORGANIZER") throw new EventError("You do not have permission to manage events.");
}

async function loadEvent(actor: Actor, eventId: string) {
  assertManager(actor);
  const e = await db.event.findFirst({
    where: { id: eventId, ...scope(actor) },
    select: {
      id: true, title: true, organizerId: true,
      organizer: { select: { id: true, email: true, name: true } },
      collaborators: { orderBy: { createdAt: "asc" }, select: { user: { select: { id: true, email: true, name: true } } } },
    },
  });
  if (!e) throw new EventError("Event not found.");
  return e;
}

export async function listEventOrganizers(actor: Actor, eventId: string) {
  const e = await loadEvent(actor, eventId);
  return {
    owner: e.organizer,
    collaborators: e.collaborators.map((c) => c.user),
    canRemoveOthers: actor.role === "SUPER_ADMIN" || e.organizerId === actor.id,
  };
}

/** Anyone who can manage the event (owner, an organizer already on it, or the Super Admin) can add another active organizer. */
export async function addCollaborator(actor: Actor, eventId: string, rawEmail: string) {
  const e = await loadEvent(actor, eventId);
  const user = await db.user.findUnique({ where: { email: rawEmail.trim().toLowerCase() }, select: { id: true, email: true, role: true, status: true } });
  if (!user || user.role !== "ORGANIZER" || user.status !== "ACTIVE") throw new EventError("No active organizer was found with that email.");
  if (user.id === e.organizerId) throw new EventError("That organizer already owns this event.");
  if (e.collaborators.some((c) => c.user.id === user.id)) throw new EventError("That organizer is already on this event.");
  const adder = await db.user.findUnique({ where: { id: actor.id }, select: { name: true, email: true } });
  await db.$transaction(async (tx) => {
    await tx.eventOrganizer.createMany({ data: [{ eventId, userId: user.id, addedById: actor.id }], skipDuplicates: true });
    await tx.auditLog.create({ data: { actorId: actor.id, action: "event.organizer_added", entityType: "Event", entityId: eventId, metadata: { userId: user.id } } });
    await enqueueEmail(tx, {
      to: user.email, template: "event-added", dedupeKey: `event-added:${eventId}:${user.id}`,
      payload: { eventTitle: e.title, addedBy: adder?.name ?? adder?.email ?? "Ticket9ja" },
    });
  });
}

/** The owner and the Super Admin can remove anyone. Any organizer can remove themselves (leave). The owner cannot be removed. */
export async function removeCollaborator(actor: Actor, eventId: string, userId: string) {
  const e = await loadEvent(actor, eventId);
  const allowed = actor.role === "SUPER_ADMIN" || e.organizerId === actor.id || userId === actor.id;
  if (!allowed) throw new EventError("Only the event owner can remove other organizers.");
  if (userId === e.organizerId) throw new EventError("The event owner cannot be removed.");
  await db.$transaction([
    db.eventOrganizer.deleteMany({ where: { eventId, userId } }),
    db.auditLog.create({ data: { actorId: actor.id, action: "event.organizer_removed", entityType: "Event", entityId: eventId, metadata: { userId } } }),
  ]);
}
