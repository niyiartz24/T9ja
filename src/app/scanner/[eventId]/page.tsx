import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { canScanEvent, recentScans, scanStats } from "@/lib/scanner";
import { ScannerClient } from "./scanner-client";

export default async function ScanEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const user = await requireRole("STAFF", "ORGANIZER", "SUPER_ADMIN");
  const { eventId } = await params;
  const actor = { id: user.id, role: user.role };
  if (!(await canScanEvent(actor, eventId))) notFound();
  const [event, stats, recent] = await Promise.all([
    db.event.findUniqueOrThrow({ where: { id: eventId }, select: { title: true } }),
    scanStats(eventId),
    recentScans(actor, eventId),
  ]);
  return <ScannerClient eventId={eventId} eventTitle={event.title} initialStats={stats} initialRecent={recent} />;
}
