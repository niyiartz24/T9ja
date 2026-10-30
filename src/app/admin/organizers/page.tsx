import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { setOrganizerStatus } from "./actions";

export default async function OrganizersPage() {
  const organizers = await db.user.findMany({
    where: { role: "ORGANIZER" },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { events: true } } },
  });
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <h1 className="text-2xl font-semibold">Organizers</h1>
      {organizers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No organizers yet. Send an invitation to get started.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Referral code</TableHead><TableHead>Events</TableHead>
              <TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {organizers.map((o) => (
              <TableRow key={o.id}>
                <TableCell>{o.name ?? "-"}</TableCell>
                <TableCell>{o.email}</TableCell>
                <TableCell className="font-mono text-xs">{o.referralCode ?? "-"}</TableCell>
                <TableCell>{o._count.events}</TableCell>
                <TableCell><Badge variant={o.status === "ACTIVE" ? "default" : "secondary"}>{o.status}</Badge></TableCell>
                <TableCell className="text-right">
                  <form action={setOrganizerStatus}>
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="status" value={o.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"} />
                    <Button size="sm" variant="outline">{o.status === "ACTIVE" ? "Suspend" : "Reactivate"}</Button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
