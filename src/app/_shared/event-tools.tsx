import Link from "next/link";
import { Download, ScanLine, Users } from "lucide-react";
import type { Actor } from "@/lib/event-service";
import { listScannerStaff } from "@/lib/staff-service";
import { Button } from "@/components/ui/button";
import { CopyLink } from "./copy-link";
import { AddStaffForm, StaffControls } from "./staff-forms";

/** Share link, scanner access and door staff: identical for organizers (own events) and Super Admins (all events). */
export async function EventTools({ actor, event, base }: { actor: Actor; event: { id: string; slug: string; status: string }; base: string }) {
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const staff = await listScannerStaff(actor, event.id);
  const link = `${appUrl}/events/${event.slug}`;
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Share link</h2>
        {event.status === "PUBLISHED" ? (
          <>
            <p className="text-sm text-muted-foreground">Anyone with this link can buy tickets for this event only. It is not listed anywhere on the site.</p>
            <CopyLink url={link} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">The link goes live when the event is published. It will be: {link}</p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline" size="sm"><Link href={`/scanner/${event.id}`}><ScanLine className="h-4 w-4" aria-hidden />Open scanner</Link></Button>
          <Button asChild variant="outline" size="sm"><Link href={`${base}/${event.id}/attendees`}><Users className="h-4 w-4" aria-hidden />Attendees</Link></Button>
          <Button asChild variant="outline" size="sm"><a href={`/api/events/${event.id}/attendees`}><Download className="h-4 w-4" aria-hidden />Export CSV</a></Button>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Scanner staff</h2>
        <p className="text-sm text-muted-foreground">Door staff sign in at /login and can only scan the events assigned to them.</p>
        {staff.length > 0 && (
          <ul className="divide-y rounded-md border">
            {staff.map((s) => (
              <li key={s.id} className="space-y-2 p-3 text-sm">
                <p className="font-medium">{s.name ?? s.email} <span className="font-normal text-muted-foreground">{s.name ? s.email : ""}</span></p>
                <StaffControls eventId={event.id} userId={s.id} />
              </li>
            ))}
          </ul>
        )}
        <AddStaffForm eventId={event.id} />
      </section>
    </div>
  );
}
