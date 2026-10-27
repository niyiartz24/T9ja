import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function AdminScans() {
  const scans = await db.ticketScan.findMany({
    orderBy: { createdAt: "desc" }, take: 100,
    select: { id: true, result: true, createdAt: true, event: { select: { title: true } }, ticket: { select: { code: true, holderName: true } }, scanner: { select: { name: true, email: true } } },
  });
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <h1 className="text-2xl font-semibold">Scan history</h1>
      <p className="text-sm text-muted-foreground">The latest 100 scans across all events.</p>
      {scans.length === 0 ? (
        <p className="text-sm text-muted-foreground">No scans yet.</p>
      ) : (
        <Table>
          <TableHeader><TableRow><TableHead>When (UTC)</TableHead><TableHead>Event</TableHead><TableHead>Ticket</TableHead><TableHead>Result</TableHead><TableHead>Scanner</TableHead></TableRow></TableHeader>
          <TableBody>
            {scans.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="whitespace-nowrap text-xs">{s.createdAt.toISOString().replace("T", " ").slice(0, 19)}</TableCell>
                <TableCell>{s.event.title}</TableCell>
                <TableCell>{s.ticket ? <><span className="font-mono text-xs">{s.ticket.code}</span> <span className="text-xs text-muted-foreground">{s.ticket.holderName}</span></> : "unknown code"}</TableCell>
                <TableCell><Badge variant={s.result === "ADMITTED" ? "default" : "secondary"}>{s.result}</Badge></TableCell>
                <TableCell>{s.scanner.name ?? s.scanner.email}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
