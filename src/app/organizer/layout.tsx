import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { logout } from "@/app/login/actions";
import { Button } from "@/components/ui/button";

export default async function OrganizerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("ORGANIZER");
  return (
    <div>
      <nav className="border-b">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-3 text-sm">
          <Link href="/organizer" className="hover:underline">Overview</Link>
          <Link href="/organizer/events" className="hover:underline">Events</Link>
          <span className="ml-auto text-muted-foreground">{user.email}</span>
          <form action={logout}><Button size="sm" variant="outline">Sign out</Button></form>
        </div>
      </nav>
      {children}
    </div>
  );
}
