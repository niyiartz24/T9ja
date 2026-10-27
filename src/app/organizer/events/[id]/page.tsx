import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { EventError, getOwnedEvent } from "@/lib/event-service";
import { publishProblems, utcToZonedInput } from "@/lib/events";
import { Badge } from "@/components/ui/badge";
import { EventForm } from "../event-form";
import { StatusActions } from "../status-actions";
import { EventTools } from "@/app/_shared/event-tools";
import { TicketTypesSection } from "./ticket-types-section";

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("ORGANIZER");
  const { id } = await params;
  const event = await getOwnedEvent({ id: user.id, role: user.role }, id).catch((e) => {
    if (e instanceof EventError) notFound();
    throw e;
  });
  const tz = event.timezone;
  const z = (d: Date | null) => (d ? utcToZonedInput(d, tz) : "");
  const editable = event.status === "DRAFT" || event.status === "PUBLISHED";
  const problems = event.status === "DRAFT" ? publishProblems(event, event.ticketTypes.filter((t) => t.isActive).length) : [];
  return (
    <main className="mx-auto max-w-2xl space-y-8 px-6 py-10">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{event.title}</h1>
        <Badge variant={event.status === "PUBLISHED" ? "default" : "secondary"}>{event.status}</Badge>
      </div>
      {problems.length > 0 && (
        <div className="rounded-md border p-4 text-sm">
          <p className="font-medium">Before you can publish:</p>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}
      <StatusActions id={event.id} status={event.status} />
      <EventTools actor={{ id: user.id, role: user.role }} event={event} base="/organizer/events" />
      <TicketTypesSection eventId={event.id} timezone={tz} types={event.ticketTypes} editable={editable} />
      {editable ? (
        <EventForm
          values={{
            id: event.id, title: event.title, description: event.description,
            venueName: event.venueName ?? "", venueAddress: event.venueAddress ?? "",
            isOnline: event.isOnline, onlineUrl: event.onlineUrl ?? "", timezone: tz,
            startsAt: z(event.startsAt), endsAt: z(event.endsAt),
            salesOpenAt: z(event.salesOpenAt), salesCloseAt: z(event.salesCloseAt),
            coverImage: event.coverImage ?? "",
          }}
        />
      ) : (
        <p className="text-sm text-muted-foreground">This event is {event.status.toLowerCase()} and can no longer be edited.</p>
      )}
    </main>
  );
}
