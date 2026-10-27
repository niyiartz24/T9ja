import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { logout } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { SwRegister } from "./sw-register";

export const metadata: Metadata = {
  title: "Ticket9ja Scanner",
  manifest: "/scanner.webmanifest",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "T9 Scanner", statusBarStyle: "default" },
  icons: { apple: "/icons/icon-192.png" },
};
export const viewport: Viewport = { themeColor: "#111111", width: "device-width", initialScale: 1 };

export default async function ScannerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("STAFF", "ORGANIZER", "SUPER_ADMIN");
  return (
    <div className="mx-auto min-h-screen max-w-lg">
      <SwRegister />
      <header className="flex items-center justify-between border-b px-4 py-3 text-sm">
        <Link href="/scanner" className="font-semibold">Ticket9ja Scanner</Link>
        <div className="flex items-center gap-3">
          <span className="max-w-[140px] truncate text-muted-foreground">{user.name ?? user.email}</span>
          <form action={logout}><Button size="sm" variant="outline">Sign out</Button></form>
        </div>
      </header>
      {children}
    </div>
  );
}
