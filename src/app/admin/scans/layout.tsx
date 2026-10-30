import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { logout } from "@/app/login/actions";
import { Button } from "@/components/ui/button";

const nav = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/tickets", label: "Tickets" },
  { href: "/admin/scans", label: "Scans" },
  { href: "/admin/organizers", label: "Organizers" },
  { href: "/admin/invitations", label: "Invitations" },
  { href: "/admin/audit", label: "Audit log" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("SUPER_ADMIN");
  return (
    <div>
      <nav className="border-b">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3 text-sm">
          {nav.map((n) => <Link key={n.href} href={n.href} className="hover:underline">{n.label}</Link>)}
          <span className="ml-auto text-muted-foreground">{user.email}</span>
          <form action={logout}><Button size="sm" variant="outline">Sign out</Button></form>
        </div>
      </nav>
      {children}
    </div>
  );
}
