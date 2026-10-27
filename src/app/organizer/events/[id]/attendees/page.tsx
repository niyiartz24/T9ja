import { requireRole } from "@/lib/auth";
import { AttendeesView } from "@/app/_shared/attendees-view";

export default async function OrganizerAttendees({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("ORGANIZER");
  const { id } = await params;
  return <AttendeesView actor={{ id: user.id, role: user.role }} eventId={id} back={`/organizer/events/${id}`} />;
}
