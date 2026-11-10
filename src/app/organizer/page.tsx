import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { scope } from "@/lib/event-service";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";

export default async function OrganizerHome() {
  const user = await requireRole("ORGANIZER");
  const mine = scope({ id: user.id, role: user.role });
  const [groups, paid, tickets] = await Promise.all([
    db.event.groupBy({ by: ["status"], where: mine, _count: true }),
    db.order.aggregate({ where: { status: "PAID", event: mine }, _sum: { totalMinor: true }, _count: true }),
    db.ticket.groupBy({ by: ["status"], where: { event: mine }, _count: true }),
  ]);
  const issued = tickets.filter((t) => t.status === "VALID" || t.status === "USED").reduce((a, t) => a + t._count, 0);
  const used = tickets.find((t) => t.status === "USED")?._count ?? 0;
  const count = (s: string) => groups.find((g) => g.status === s)?._count ?? 0;
  const stats = [["Drafts", count("DRAFT")], ["Published", count("PUBLISHED")], ["Cancelled", count("CANCELLED")], ["Completed", count("COMPLETED")]] as const;
  return (
    <main className="mx-auto max-w-5xl space-y-8 px-6 py-10">
      <h1 className="text-2xl font-semibold">Welcome{user.name ? `, ${user.name}` : ""}</h1>
      <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        {stats.map(([label, n]) => (
          <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="text-3xl font-semibold">{n}</dd></div>
        ))}
      </dl>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border p-4"><dt className="text-sm text-muted-foreground">Paid orders</dt><dd className="mt-1 text-2xl font-semibold">{paid._count}</dd></div>
        <div className="rounded-lg border p-4"><dt className="text-sm text-muted-foreground">Revenue (paid)</dt><dd className="mt-1 text-2xl font-semibold">{formatMoney(paid._sum.totalMinor ?? 0, "NGN")}</dd></div>
        <div className="rounded-lg border p-4"><dt className="text-sm text-muted-foreground">Tickets issued</dt><dd className="mt-1 text-2xl font-semibold">{issued}</dd><p className="mt-1 text-xs text-muted-foreground">{used} used at the door</p></div>
      </dl>
      <div className="flex flex-wrap gap-3">
        <Button asChild><Link href="/organizer/events/new">Create event</Link></Button>
        <Button asChild variant="outline"><Link href="/organizer/orders">View orders and buyers</Link></Button>
      </div>
    </main>
  );
}
