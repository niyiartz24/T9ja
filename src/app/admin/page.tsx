import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { platformStats } from "@/lib/admin-stats";
import { formatMinor, formatMoney } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="rounded-lg border p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

export default async function AdminHome() {
  const s = await platformStats();
  const money = (m: number) => formatMoney(m, "NGN");
  return (
    <main className="mx-auto max-w-6xl space-y-10 px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Platform overview</h1>
        <Button asChild><Link href="/admin/events/new">Create event</Link></Button>
      </div>

      {(s.attention.review > 0 || s.attention.refundDue > 0) && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-destructive p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            {s.attention.review > 0 && <>{s.attention.review} payment(s) need review (amount mismatch). </>}
            {s.attention.refundDue > 0 && <>{s.attention.refundDue} payment(s) need a refund. </>}
            <Link href="/admin/orders?attention=1" className="underline">Open them</Link>
          </p>
        </div>
      )}

      <section aria-labelledby="platform">
        <h2 id="platform" className="mb-3 text-lg font-semibold">Platform</h2>
        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Organizers" value={s.organizers} />
          <Stat label="Published events" value={s.events.published} note={`${s.events.draft} drafts, ${s.events.cancelled} cancelled, ${s.events.completed} completed`} />
          <Stat label="Paid orders" value={s.orders.paid} note={`${s.orders.pending} pending of ${s.orders.total} total`} />
          <Stat label="Tickets issued" value={s.tickets.issued} note={`${s.tickets.used} used, ${s.tickets.valid} valid`} />
        </dl>
      </section>

      <section aria-labelledby="money">
        <h2 id="money" className="mb-3 text-lg font-semibold">Payments</h2>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat label="Successful" value={money(s.money.succeeded.minor)} note={`${s.money.succeeded.count} payments`} />
          <Stat label="Pending" value={money(s.money.pending.minor)} note={`${s.money.pending.count} payments awaiting confirmation`} />
          <Stat label="Refunded" value={money(s.money.refunded.minor)} note={`${s.money.refunded.count} payments`} />
        </dl>
      </section>

      <section aria-labelledby="top" className="space-y-3">
        <h2 id="top" className="text-lg font-semibold">Top events by revenue</h2>
        {s.topEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No paid sales yet.</p>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Event</TableHead><TableHead>Organizer</TableHead><TableHead>Paid orders</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader>
            <TableBody>
              {s.topEvents.map((e) => (
                <TableRow key={e.eventId}>
                  <TableCell><Link className="hover:underline" href={`/admin/events/${e.eventId}`}>{e.title}</Link></TableCell>
                  <TableCell>{e.organizer}</TableCell>
                  <TableCell>{e.paidOrders}</TableCell>
                  <TableCell className="text-right">{formatMoney(e.revenueMinor, "NGN")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section aria-labelledby="recent" className="space-y-3">
        <h2 id="recent" className="text-lg font-semibold">Recent orders</h2>
        {s.recentOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground">No orders yet.</p>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Reference</TableHead><TableHead>Event</TableHead><TableHead>Buyer</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
            <TableBody>
              {s.recentOrders.map((o) => (
                <TableRow key={o.reference}>
                  <TableCell className="font-mono text-xs">{o.reference}</TableCell>
                  <TableCell>{o.event.title}</TableCell>
                  <TableCell>{o.buyerName}</TableCell>
                  <TableCell><Badge variant={o.status === "PAID" ? "default" : "secondary"}>{o.status}</Badge></TableCell>
                  <TableCell className="text-right">{o.totalMinor === 0 ? "Free" : formatMinor(o.totalMinor, o.currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </main>
  );
}
