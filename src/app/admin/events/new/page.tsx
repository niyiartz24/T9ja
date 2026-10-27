import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { EventForm } from "@/app/organizer/events/event-form";

export default async function AdminNewEvent() {
  const admin = await requireRole("SUPER_ADMIN");
  const users = await db.user.findMany({
    where: { status: "ACTIVE", role: { in: ["ORGANIZER", "SUPER_ADMIN"] } },
    select: { id: true, email: true, name: true, role: true },
    orderBy: [{ role: "desc" }, { email: "asc" }],
  });
  const owners = users.map((u) => ({ id: u.id, label: u.id === admin.id ? "Ticket9ja (me)" : `${u.name ?? u.email} (${u.email})` }));
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <h1 className="text-2xl font-semibold">Create event</h1>
      <EventForm
        owners={owners}
        ownerDefault={admin.id}
        values={{
          title: "", description: "", venueName: "", venueAddress: "", isOnline: false, onlineUrl: "",
          timezone: "Africa/Lagos", startsAt: "", endsAt: "", salesOpenAt: "", salesCloseAt: "", coverImage: "",
        }}
      />
    </main>
  );
}
