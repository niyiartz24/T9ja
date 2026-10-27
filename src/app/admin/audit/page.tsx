import { db } from "@/lib/db";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function AuditPage() {
  const logs = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" }, take: 100,
    select: { id: true, action: true, entityType: true, entityId: true, createdAt: true, actor: { select: { email: true } } },
  });
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <p className="text-sm text-muted-foreground">The latest 100 recorded actions.</p>
      {logs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
      ) : (
        <Table>
          <TableHeader><TableRow><TableHead>When (UTC)</TableHead><TableHead>Actor</TableHead><TableHead>Action</TableHead><TableHead>Record</TableHead></TableRow></TableHeader>
          <TableBody>
            {logs.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="whitespace-nowrap text-xs">{l.createdAt.toISOString().replace("T", " ").slice(0, 19)}</TableCell>
                <TableCell>{l.actor?.email ?? "system / customer"}</TableCell>
                <TableCell className="font-mono text-xs">{l.action}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{l.entityType} {l.entityId?.slice(0, 10)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
