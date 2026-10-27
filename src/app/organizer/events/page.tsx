import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { listOwnedEvents } from "@/lib/event-service";
import { formatInTz } from "@/lib/events";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function EventsPage() {
  const user = await requireRole("ORGANIZER");
  const events = await listOwnedEvents({ id: user.id, role: user.role });
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Events</h1>
        <Button asChild><Link href="/organizer/events/new">Create event</Link></Button>
      </div>
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">You have no events yet. Create your first one to get started.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow><TableHead>Title</TableHead><TableHead>Starts</TableHead><TableHead>Status</TableHead><TableHead>Orders</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {events.map((e) => (
              <TableRow key={e.id}>
                <TableCell><Link className="font-medium hover:underline" href={`/organizer/events/${e.id}`}>{e.title}</Link></TableCell>
                <TableCell>{formatInTz(e.startsAt, e.timezone)}</TableCell>
                <TableCell><Badge variant={e.status === "PUBLISHED" ? "default" : "secondary"}>{e.status}</Badge></TableCell>
                <TableCell>{e._count.orders}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
