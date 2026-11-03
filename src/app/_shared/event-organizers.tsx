import { db } from "@/lib/db";
import { listEventOrganizers } from "@/lib/collaborator-service";
import type { Actor } from "@/lib/event-service";
import { Badge } from "@/components/ui/badge";
import { AddOrganizerForm, RemoveOrganizerButton } from "./organizer-forms";

/** Who runs this event. Identical for the Super Admin and for organizers on the event. */
export async function EventOrganizers({ actor, eventId }: { actor: Actor; eventId: string }) {
  const { owner, collaborators, canRemoveOthers } = await listEventOrganizers(actor, eventId);
  // Only the Super Admin gets a picker of all organizers. Organizers type an email, so the directory stays private.
  const suggestions = actor.role === "SUPER_ADMIN"
    ? await db.user.findMany({ where: { role: "ORGANIZER", status: "ACTIVE" }, select: { email: true, name: true }, orderBy: { email: "asc" }, take: 300 })
    : [];
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Organizers on this event</h2>
      <p className="text-sm text-muted-foreground">Everyone listed can manage this event, see its attendees and scan tickets. Only the owner (or the Super Admin) can cancel it or remove others.</p>
      <ul className="divide-y rounded-md border">
        <li className="flex items-center justify-between gap-3 p-3 text-sm">
          <span>{owner.name ?? owner.email} <span className="text-muted-foreground">{owner.name ? owner.email : ""}</span></span>
          <Badge>Owner</Badge>
        </li>
        {collaborators.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 p-3 text-sm">
            <span>{c.name ?? c.email} <span className="text-muted-foreground">{c.name ? c.email : ""}</span></span>
            {canRemoveOthers && <RemoveOrganizerButton eventId={eventId} userId={c.id} label="Remove" confirmText={`Remove ${c.name ?? c.email} from this event?`} />}
            {!canRemoveOthers && c.id === actor.id && <RemoveOrganizerButton eventId={eventId} userId={c.id} label="Leave event" confirmText="Leave this event? You will lose access to it." />}
          </li>
        ))}
      </ul>
      <AddOrganizerForm eventId={eventId} suggestions={suggestions} />
    </section>
  );
}
