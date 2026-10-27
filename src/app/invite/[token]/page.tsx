import { findOpenInvitation } from "@/lib/invitations";
import { AcceptForm } from "./accept-form";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await findOpenInvitation(token);
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold">Join Ticket9ja</h1>
      {inv ? (
        <AcceptForm token={token} email={inv.email} />
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          This invitation is invalid or has expired. Ask the Ticket9ja team to send a new one.
        </p>
      )}
    </main>
  );
}
