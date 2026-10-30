import Link from "next/link";
import { db } from "@/lib/db";
import { formatMinor, minorToMajorInput } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PaymentActions } from "./payment-actions";

type Claim = { claim?: { senderName?: string; note?: string } };

export default async function AdminPayments() {
  const rows = await db.payment.findMany({
    where: { provider: "manual", status: "PENDING", order: { status: "PENDING" } },
    orderBy: [{ claimedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true, amountMinor: true, currency: true, claimedAt: true, createdAt: true, meta: true,
      order: { select: { reference: true, buyerName: true, buyerEmail: true, event: { select: { title: true } } } },
    },
  });
  const claimed = rows.filter((r) => r.claimedAt).length;
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <h1 className="text-2xl font-semibold">Bank transfers to verify</h1>
      <p className="text-sm text-muted-foreground">
        Check each transfer on the bank statement (VFD MFB, Ticket9ja account). Match the amount and the order reference in the description, then confirm.
        {" "}{claimed} reported, {rows.length - claimed} not yet reported by the customer. See also <Link href="/admin/orders" className="underline">all orders</Link>.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing is waiting for verification.</p>
      ) : (
        <Table>
          <TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Buyer</TableHead><TableHead>Expected</TableHead><TableHead>Customer said</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => {
              const c = (r.meta as Claim | null)?.claim;
              return (
                <TableRow key={r.id}>
                  <TableCell><div className="font-mono text-xs">{r.order.reference}</div><div className="text-xs text-muted-foreground">{r.order.event.title}</div></TableCell>
                  <TableCell><div>{r.order.buyerName}</div><div className="text-xs text-muted-foreground">{r.order.buyerEmail}</div></TableCell>
                  <TableCell className="whitespace-nowrap font-medium">{formatMinor(r.amountMinor, r.currency)}</TableCell>
                  <TableCell>
                    {r.claimedAt ? (
                      <><Badge>Reported</Badge><div className="mt-1 text-sm">{c?.senderName}</div>{c?.note && <div className="text-xs text-muted-foreground">{c.note}</div>}<div className="text-xs text-muted-foreground">{r.claimedAt.toISOString().replace("T", " ").slice(0, 16)} UTC</div></>
                    ) : (
                      <Badge variant="secondary">Not reported yet</Badge>
                    )}
                  </TableCell>
                  <TableCell><PaymentActions paymentId={r.id} expectedAmount={minorToMajorInput(r.amountMinor)} /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
