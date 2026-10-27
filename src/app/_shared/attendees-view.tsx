import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { db } from "@/lib/db";
import { EventError, getOwnedEvent, type Actor } from "@/lib/event-service";
import { formatInTz } from "@/lib/events";
import { formatMoney } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const LIMIT = 500;

export async function AttendeesView({ actor, eventId, back }: { actor: Actor; eventId: string; back: string }) {
  const event = await getOwnedEvent(actor, eventId).catch((e) => {
    if (e instanceof EventError) notFound();
    throw e;
  });
  const [tickets, paid] = await Promise.all([
    db.ticket.findMany({
      where: { eventId }, orderBy: { issuedAt: "desc" }, take: LIMIT,
      select: { id: true, code: true, status: true, holderName: true, holderEmail: true, issuedAt: true, usedAt: true, ticketType: { select: { name: true } }, order: { select: { reference: true } } },
    }),
    db.order.aggregate({ where: { eventId, status: "PAID" }, _sum: { totalMinor: true }, _count: true }),
  ]);
  const used = tickets.filter((t) => t.status === "USED").length;
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <p className="text-sm"><Link href={back} className="text-muted-foreground hover:underline">Back to event</Link></p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Attendees: {event.title}</h1>
        <Button asChild variant="outline"><a href={`/api/events/${eventId}/attendees`}><Download className="h-4 w-4" aria-hidden />Export CSV</a></Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {paid._count} paid orders, {formatMoney(paid._sum.totalMinor ?? 0, "NGN")} revenue, {tickets.length} tickets shown, {used} used.
        {tickets.length === LIMIT && " Showing the latest 500; export the CSV for everything."}
      </p>
      {tickets.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tickets have been issued yet.</p>
      ) : (
        <Table>
          <TableHeader><TableRow><TableHead>Ticket ID</TableHead><TableHead>Holder</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Order</TableHead><TableHead>Issued</TableHead><TableHead>Used at</TableHead></TableRow></TableHeader>
          <TableBody>
            {tickets.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-mono text-xs">{t.code}</TableCell>
                <TableCell><div>{t.holderName}</div><div className="text-xs text-muted-foreground">{t.holderEmail}</div></TableCell>
                <TableCell>{t.ticketType.name}</TableCell>
                <TableCell><Badge variant={t.status === "VALID" ? "default" : "secondary"}>{t.status}</Badge></TableCell>
                <TableCell className="font-mono text-xs">{t.order.reference}</TableCell>
                <TableCell>{formatInTz(t.issuedAt, event.timezone)}</TableCell>
                <TableCell>{t.usedAt ? formatInTz(t.usedAt, event.timezone) : "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
