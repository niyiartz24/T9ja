import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { scope } from "@/lib/event-service";
import { formatMinor } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const PAGE = 30;
const STATUSES = ["PENDING", "PAID", "FAILED", "EXPIRED", "CANCELLED", "REFUNDED"] as const;

/** Orders and buyer details for every event the organizer owns or was added to. Nothing from other organizers' events. */
export default async function OrganizerOrders({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; event?: string; page?: string }> }) {
  const user = await requireRole("ORGANIZER");
  const mine = scope({ id: user.id, role: user.role });
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const status = STATUSES.find((s) => s === sp.status);
  const page = Math.min(Math.max(Number.parseInt(sp.page ?? "1", 10) || 1, 1), 500);

  const events = await db.event.findMany({ where: mine, select: { id: true, title: true }, orderBy: { startsAt: "desc" }, take: 200 });
  const eventId = events.find((e) => e.id === sp.event)?.id; // an id from someone else's event is simply ignored

  const where: Prisma.OrderWhereInput = {
    event: mine,
    ...(eventId ? { eventId } : {}),
    ...(status ? { status } : {}),
    ...(q ? { OR: [{ reference: q.toUpperCase() }, { referralCode: q.toUpperCase() }, { buyerEmail: { contains: q.toLowerCase() } }, { buyerName: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [total, orders] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE,
      select: {
        id: true, reference: true, referralCode: true, buyerName: true, buyerEmail: true, totalMinor: true, currency: true, status: true, createdAt: true,
        event: { select: { title: true } },
        payments: { orderBy: { createdAt: "desc" }, take: 2, select: { id: true, provider: true, status: true } },
        _count: { select: { tickets: true } },
      },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (p: number) => `/organizer/orders?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}), ...(eventId ? { event: eventId } : {}), page: String(p) })}`;
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <h1 className="text-2xl font-semibold">Orders and buyers</h1>
      <form className="flex flex-wrap items-center gap-3" role="search">
        <Input name="q" defaultValue={q} placeholder="Reference, referral code, email or name" aria-label="Search orders" className="max-w-xs" />
        <select name="event" defaultValue={eventId ?? ""} aria-label="Event" className="h-9 max-w-[220px] rounded-md border bg-background px-3 text-sm">
          <option value="">All my events</option>
          {events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
        <select name="status" defaultValue={status ?? ""} aria-label="Status" className="h-9 rounded-md border bg-background px-3 text-sm">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <Button type="submit" variant="outline">Filter</Button>
      </form>
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">No orders match.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow><TableHead>Order</TableHead><TableHead>Event</TableHead><TableHead>Buyer</TableHead><TableHead>Status</TableHead><TableHead>Payment</TableHead><TableHead>Tickets</TableHead><TableHead className="text-right">Total</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-mono text-xs">{o.reference}{o.referralCode && <div className="text-muted-foreground">{o.referralCode}</div>}<div className="font-sans text-muted-foreground">{o.createdAt.toISOString().slice(0, 10)}</div></TableCell>
                <TableCell>{o.event.title}</TableCell>
                <TableCell><div>{o.buyerName}</div><div className="text-xs text-muted-foreground">{o.buyerEmail}</div></TableCell>
                <TableCell><Badge variant={o.status === "PAID" ? "default" : "secondary"}>{o.status}</Badge></TableCell>
                <TableCell className="space-x-1">{o.payments.length === 0 ? <span className="text-muted-foreground">{o.totalMinor === 0 ? "free" : "none"}</span> : o.payments.map((p) => <Badge key={p.id} variant="secondary">{p.provider === "korapay" ? "Korapay " : p.provider === "manual" ? "Transfer " : ""}{p.status}</Badge>)}</TableCell>
                <TableCell>{o._count.tickets}</TableCell>
                <TableCell className="text-right">{o.totalMinor === 0 ? "Free" : formatMinor(o.totalMinor, o.currency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center gap-4 text-sm">
          {page > 1 && <Link href={qs(page - 1)} className="hover:underline">Previous</Link>}
          <span className="text-muted-foreground">Page {page} of {pages}</span>
          {page < pages && <Link href={qs(page + 1)} className="hover:underline">Next</Link>}
        </nav>
      )}
    </main>
  );
}
