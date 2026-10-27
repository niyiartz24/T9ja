import { db } from "@/lib/db";
import { formatInTz } from "@/lib/events";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function AdminTickets({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim().slice(0, 80);
  const tickets = q
    ? await db.ticket.findMany({
        where: { OR: [{ code: q.toUpperCase() }, { order: { reference: q.toUpperCase() } }, { holderEmail: q.toLowerCase() }] },
        orderBy: { issuedAt: "desc" }, take: 50,
        select: {
          id: true, code: true, status: true, holderName: true, holderEmail: true, issuedAt: true, usedAt: true,
          event: { select: { title: true, timezone: true } }, ticketType: { select: { name: true } }, order: { select: { reference: true } },
        },
      })
    : [];
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <h1 className="text-2xl font-semibold">Find a ticket</h1>
      <form className="flex gap-3" role="search">
        <Input name="q" defaultValue={q} placeholder="Ticket ID, order reference or buyer email" aria-label="Search tickets" className="max-w-md" />
        <Button type="submit">Search</Button>
      </form>
      {!q ? (
        <p className="text-sm text-muted-foreground">Enter a ticket ID (like 7K2M-QX9D-4HTB), an order reference, or the buyer&apos;s email.</p>
      ) : tickets.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tickets match.</p>
      ) : (
        <Table>
          <TableHeader><TableRow><TableHead>Ticket ID</TableHead><TableHead>Status</TableHead><TableHead>Holder</TableHead><TableHead>Event</TableHead><TableHead>Type</TableHead><TableHead>Order</TableHead><TableHead>Used at</TableHead></TableRow></TableHeader>
          <TableBody>
            {tickets.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-mono text-xs">{t.code}</TableCell>
                <TableCell><Badge variant={t.status === "VALID" ? "default" : "secondary"}>{t.status}</Badge></TableCell>
                <TableCell><div>{t.holderName}</div><div className="text-xs text-muted-foreground">{t.holderEmail}</div></TableCell>
                <TableCell>{t.event.title}</TableCell>
                <TableCell>{t.ticketType.name}</TableCell>
                <TableCell className="font-mono text-xs">{t.order.reference}</TableCell>
                <TableCell>{t.usedAt ? formatInTz(t.usedAt, t.event.timezone) : "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
