import Link from "next/link";
import { db } from "@/lib/db";
import { formatInTz } from "@/lib/events";
import { formatMoney } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const PAGE = 25;

export default async function AdminEvents({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const page = Math.min(Math.max(Number.parseInt(sp.page ?? "1", 10) || 1, 1), 200);
  const where = q ? { OR: [{ title: { contains: q, mode: "insensitive" as const } }, { organizer: { email: { contains: q, mode: "insensitive" as const } } }] } : {};
  const [total, events] = await Promise.all([
    db.event.count({ where }),
    db.event.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE,
      select: { id: true, title: true, status: true, startsAt: true, timezone: true, organizer: { select: { name: true, email: true } } },
    }),
  ]);
  const ids = events.map((e) => e.id);
  const [paid, tickets] = ids.length
    ? await Promise.all([
        db.order.groupBy({ by: ["eventId"], where: { eventId: { in: ids }, status: "PAID" }, _sum: { totalMinor: true }, _count: true }),
        db.ticket.groupBy({ by: ["eventId"], where: { eventId: { in: ids } }, _count: true }),
      ])
    : [[], []];
  const pages = Math.max(1, Math.ceil(total / PAGE));
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">All events</h1>
        <Button asChild><Link href="/admin/events/new">Create event</Link></Button>
      </div>
      <form className="flex gap-3" role="search">
        <Input name="q" defaultValue={q} placeholder="Search by title or organizer email" aria-label="Search events" className="max-w-sm" />
        <Button type="submit" variant="outline">Search</Button>
      </form>
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">No events found.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow><TableHead>Event</TableHead><TableHead>Organizer</TableHead><TableHead>Starts</TableHead><TableHead>Status</TableHead><TableHead>Tickets</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {events.map((e) => {
              const p = paid.find((x) => x.eventId === e.id);
              return (
                <TableRow key={e.id}>
                  <TableCell><Link className="font-medium hover:underline" href={`/admin/events/${e.id}`}>{e.title}</Link></TableCell>
                  <TableCell>{e.organizer.name ?? e.organizer.email}</TableCell>
                  <TableCell>{formatInTz(e.startsAt, e.timezone)}</TableCell>
                  <TableCell><Badge variant={e.status === "PUBLISHED" ? "default" : "secondary"}>{e.status}</Badge></TableCell>
                  <TableCell>{tickets.find((x) => x.eventId === e.id)?._count ?? 0}</TableCell>
                  <TableCell className="text-right">{formatMoney(p?._sum.totalMinor ?? 0, "NGN")}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      {pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center gap-4 text-sm">
          {page > 1 && <Link href={`/admin/events?q=${encodeURIComponent(q)}&page=${page - 1}`} className="hover:underline">Previous</Link>}
          <span className="text-muted-foreground">Page {page} of {pages}</span>
          {page < pages && <Link href={`/admin/events?q=${encodeURIComponent(q)}&page=${page + 1}`} className="hover:underline">Next</Link>}
        </nav>
      )}
    </main>
  );
}
