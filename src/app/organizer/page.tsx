import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export default async function OrganizerHome() {
  const user = await requireRole("ORGANIZER");
  const groups = await db.event.groupBy({ by: ["status"], where: { organizerId: user.id }, _count: true });
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
      <Button asChild><Link href="/organizer/events/new">Create event</Link></Button>
    </main>
  );
}
