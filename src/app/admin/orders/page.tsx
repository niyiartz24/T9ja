import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { formatMinor } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefundButton } from "./refund-button";
import { ResendButton } from "./resend-button";

const PAGE = 30;
const STATUSES = ["PENDING", "PAID", "FAILED", "EXPIRED", "CANCELLED", "REFUNDED"] as const;

export default async function AdminOrders({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; attention?: string; page?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const status = STATUSES.find((s) => s === sp.status);
  const attention = sp.attention === "1";
  const page = Math.min(Math.max(Number.parseInt(sp.page ?? "1", 10) || 1, 1), 500);

  const where: Prisma.OrderWhereInput = {
    ...(status ? { status } : {}),
    ...(attention ? { payments: { some: { OR: [{ status: "REVIEW" }, { refundRequired: true, status: { not: "REFUNDED" } }] } } } : {}),
    ...(q ? { OR: [{ reference: q.toUpperCase() }, { referralCode: q.toUpperCase() }, { buyerEmail: { contains: q.toLowerCase() } }, { buyerName: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [total, orders] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE,
      select: {
        id: true, reference: true, referralCode: true, buyerName: true, buyerEmail: true, totalMinor: true, currency: true, status: true, createdAt: true,
        event: { select: { id: true, title: true } },
        payments: { orderBy: { createdAt: "desc" }, take: 3, select: { id: true, status: true, refundRequired: true } },
      },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (p: number) => `/admin/orders?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}), ...(attention ? { attention: "1" } : {}), page: String(p) })}`;
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <h1 className="text-2xl font-semibold">Orders and payments</h1>
      <form className="flex flex-wrap items-center gap-3" role="search">
        <Input name="q" defaultValue={q} placeholder="Reference, referral code, email or name" aria-label="Search orders" className="max-w-xs" />
        <select name="status" defaultValue={status ?? ""} aria-label="Status" className="h-9 rounded-md border bg-background px-3 text-sm">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="attention" value="1" defaultChecked={attention} />Needs attention</label>
        <Button type="submit" variant="outline">Filter</Button>
      </form>
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">No orders match.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow><TableHead>Reference</TableHead><TableHead>Event</TableHead><TableHead>Buyer</TableHead><TableHead>Order</TableHead><TableHead>Payment</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Action</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((o) => {
              const refundable = o.payments.find((p) => (p.status === "SUCCEEDED" || p.status === "REVIEW") && (p.refundRequired || p.status === "REVIEW" || o.status === "PAID"));
              return (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs">{o.reference}{o.referralCode && <div className="text-muted-foreground">{o.referralCode}</div>}</TableCell>
                  <TableCell><Link className="hover:underline" href={`/admin/events/${o.event.id}`}>{o.event.title}</Link></TableCell>
                  <TableCell><div>{o.buyerName}</div><div className="text-xs text-muted-foreground">{o.buyerEmail}</div></TableCell>
                  <TableCell><Badge variant={o.status === "PAID" ? "default" : "secondary"}>{o.status}</Badge></TableCell>
                  <TableCell className="space-x-1">
                    {o.payments.length === 0 ? <span className="text-muted-foreground">{o.totalMinor === 0 ? "n/a" : "none"}</span> : o.payments.map((p) => (
                      <Badge key={p.id} variant={p.status === "REVIEW" || p.refundRequired ? "outline" : "secondary"}>{p.status}{p.refundRequired && p.status !== "REFUNDED" ? " (refund due)" : ""}</Badge>
                    ))}
                  </TableCell>
                  <TableCell className="text-right">{o.totalMinor === 0 ? "Free" : formatMinor(o.totalMinor, o.currency)}</TableCell>
                  <TableCell className="space-y-1 text-right">{o.status === "PAID" && <ResendButton orderId={o.id} />}{refundable && <RefundButton paymentId={refundable.id} />}</TableCell>
                </TableRow>
              );
            })}
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
