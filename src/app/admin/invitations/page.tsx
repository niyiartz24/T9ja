import { db } from "@/lib/db";
import { inviteState } from "@/lib/invitations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InviteForm } from "./invite-form";
import { InvitationButtons } from "./invitation-buttons";

export default async function InvitationsPage() {
  const invitations = await db.organizerInvitation.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <main className="mx-auto max-w-5xl space-y-8 px-6 py-10">
      <h1 className="text-2xl font-semibold">Organizer invitations</h1>
      <InviteForm />
      {invitations.length === 0 ? (
        <p className="text-sm text-muted-foreground">No invitations yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead><TableHead>Status</TableHead>
              <TableHead>Expires</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invitations.map((inv) => {
              const state = inviteState(inv);
              return (
                <TableRow key={inv.id}>
                  <TableCell>{inv.email}</TableCell>
                  <TableCell><Badge variant={state === "ACCEPTED" ? "default" : "secondary"}>{state}</Badge></TableCell>
                  <TableCell>{inv.expiresAt.toISOString().slice(0, 10)}</TableCell>
                  <TableCell className="text-right"><InvitationButtons id={inv.id} canResend={state === "PENDING" || state === "EXPIRED"} canRevoke={state === "PENDING"} /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
