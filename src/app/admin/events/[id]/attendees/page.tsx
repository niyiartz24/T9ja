import { requireRole } from "@/lib/auth";
import { AttendeesView } from "@/app/_shared/attendees-view";

export default async function AdminAttendees({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("SUPER_ADMIN");
  const { id } = await params;
  return <AttendeesView actor={{ id: user.id, role: user.role }} eventId={id} back={`/admin/events/${id}`} />;
}
