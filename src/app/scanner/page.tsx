import Link from "next/link";
import { ScanLine } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { formatInTz } from "@/lib/events";

export default async function ScannerHome() {
  const user = await requireRole("STAFF", "ORGANIZER", "SUPER_ADMIN");
  const base = { status: "PUBLISHED" as const };
  const where =
    user.role === "SUPER_ADMIN" ? base
    : user.role === "ORGANIZER" ? { ...base, organizerId: user.id }
    : { ...base, staff: { some: { userId: user.id } } };
  const events = await db.event.findMany({
    where, orderBy: { startsAt: "asc" }, take: 50,
    select: { id: true, title: true, startsAt: true, timezone: true, venueName: true },
  });
  return (
    <main className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">Choose an event to scan</h1>
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">No events are assigned to you yet. Ask the organizer to add you as scanner staff.</p>
      ) : (
        <ul className="space-y-3">
          {events.map((e) => (
            <li key={e.id}>
              <Link href={`/scanner/${e.id}`} className="flex items-center gap-4 rounded-lg border p-4 active:bg-muted">
                <ScanLine className="h-6 w-6 shrink-0" aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{e.title}</span>
                  <span className="block text-sm text-muted-foreground">{formatInTz(e.startsAt, e.timezone)}{e.venueName ? `, ${e.venueName}` : ""}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
