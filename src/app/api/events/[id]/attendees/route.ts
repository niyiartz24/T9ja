import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { csvRow } from "@/lib/csv";
import { EventError, getOwnedEvent } from "@/lib/event-service";

export const dynamic = "force-dynamic";

/** Authorized export: organizers get their own events, Super Admins any event. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ORGANIZER" && user.role !== "SUPER_ADMIN")) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const actor = { id: user.id, role: user.role };
  let event;
  try {
    event = await getOwnedEvent(actor, id);
  } catch (e) {
    if (e instanceof EventError) return new Response("Not found", { status: 404 });
    throw e;
  }
  const tickets = await db.ticket.findMany({
    where: { eventId: id }, orderBy: { issuedAt: "asc" }, take: 20000,
    select: { code: true, status: true, holderName: true, holderEmail: true, issuedAt: true, usedAt: true, ticketType: { select: { name: true } }, order: { select: { reference: true, referralCode: true } } },
  });
  await db.auditLog.create({ data: { actorId: user.id, action: "attendees.export", entityType: "Event", entityId: id, metadata: { rows: tickets.length } } });
  const lines = [
    csvRow(["Ticket ID", "Name", "Email", "Ticket type", "Status", "Order", "Referral code", "Issued (UTC)", "Used (UTC)"]),
    ...tickets.map((t) => csvRow([t.code, t.holderName, t.holderEmail, t.ticketType.name, t.status, t.order.reference, t.order.referralCode ?? "", t.issuedAt.toISOString(), t.usedAt?.toISOString() ?? ""])),
  ];
  return new Response(lines.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="attendees-${event.slug}.csv"`, "Cache-Control": "no-store" },
  });
}
