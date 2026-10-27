import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { EventError, getOwnedEvent } from "@/lib/event-service";
import { publishProblems, utcToZonedInput } from "@/lib/events";
import { formatMoney } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { EventForm } from "@/app/organizer/events/event-form";
import { StatusActions } from "@/app/organizer/events/status-actions";
import { EventTools } from "@/app/_shared/event-tools";
import { TicketTypesSection } from "@/app/organizer/events/[id]/ticket-types-section";

export default async function AdminEventPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireRole("SUPER_ADMIN");
  const { id } = await params;
  const [event, paid, issued] = await Promise.all([
    getOwnedEvent({ id: admin.id, role: admin.role }, id).catch((e) => {
      if (e instanceof EventError) notFound();
      throw e;
    }),
    db.order.aggregate({ where: { eventId: id, status: "PAID" }, _sum: { totalMinor: true }, _count: true }),
    db.ticket.groupBy({ by: ["status"], where: { eventId: id }, _count: true }),
  ]);
  const tz = event.timezone;
  const z = (d: Date | null) => (d ? utcToZonedInput(d, tz) : "");
  const editable = event.status === "DRAFT" || event.status === "PUBLISHED";
  const problems = event.status === "DRAFT" ? publishProblems(event, event.ticketTypes.filter((t) => t.isActive).length) : [];
  const ticketCount = (s: string) => issued.find((t) => t.status === s)?._count ?? 0;
  return (
    <main className="mx-auto max-w-2xl space-y-8 px-6 py-10">
      <p className="text-sm"><Link href="/admin/events" className="text-muted-foreground hover:underline">All events</Link></p>
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{event.title}</h1>
          <Badge variant={event.status === "PUBLISHED" ? "default" : "secondary"}>{event.status}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Organizer: {event.organizer.name ?? event.organizer.email} ({event.organizer.email}).
          {" "}{paid._count} paid orders, {formatMoney(paid._sum.totalMinor ?? 0, "NGN")} revenue,
          {" "}{ticketCount("VALID") + ticketCount("USED")} tickets issued, {ticketCount("USED")} used.
        </p>
      </div>
      {problems.length > 0 && (
        <div className="rounded-md border p-4 text-sm">
          <p className="font-medium">Before this can be published:</p>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}
      <StatusActions id={event.id} status={event.status} />
      <EventTools actor={{ id: admin.id, role: admin.role }} event={event} base="/admin/events" />
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
