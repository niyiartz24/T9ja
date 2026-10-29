import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatInTz } from "@/lib/events";
import { formatMinor } from "@/lib/money";
import { instructionsOf } from "@/lib/payments/instructions";
import Link from "next/link";
import { after } from "next/server";
import { maskEmail } from "@/lib/format";
import { processOutbox } from "@/lib/outbox";
import { allow } from "@/lib/rate-limit";
import { verifyOrderPayments } from "@/lib/payments/service";
import { AutoRefresh, PayButton } from "./pay-button";

const STATUS: Record<string, { title: string; body: string }> = {
  PAID: { title: "Order confirmed", body: "Your tickets have been issued for this order." },
  PENDING: { title: "Awaiting payment", body: "Your tickets are held for a short time while payment is completed." },
  EXPIRED: { title: "Reservation expired", body: "This order was not completed in time and the tickets were released." },
  FAILED: { title: "Order failed", body: "Something went wrong with this order. No payment was taken." },
  CANCELLED: { title: "Order cancelled", body: "This order was cancelled." },
  REFUNDED: { title: "Order refunded", body: "This order has been refunded." },
};

const load = (reference: string) =>
  db.order.findUnique({
    where: { reference },
    include: {
      event: true,
      items: { include: { ticketType: true } },
      payments: { where: { status: { in: ["INITIATED", "PENDING"] } }, select: { id: true, meta: true }, orderBy: { createdAt: "desc" }, take: 1 },
      tickets: { orderBy: [{ ticketTypeId: "asc" }, { sequence: "asc" }], select: { id: true, code: true, qrToken: true, ticketType: { select: { name: true } } } },
    },
  });

export default async function OrderPage({ params }: { params: Promise<{ reference: string }> }) {
  const reference = (await params).reference.trim().toUpperCase();
  if (!/^T9-[0-9A-Z]{10}$/.test(reference)) notFound();
  let order = await load(reference);
  if (!order) notFound();

  // A success redirect proves nothing. Ask the gateway, via the same code path the webhook uses.
  if (order.status === "PENDING" && order.payments.length > 0 && (await allow("order-verify", 40, 60))) {
    if (await verifyOrderPayments(order.id)) order = (await load(reference)) ?? order;
  }

  if (order.status === "PAID") after(() => processOutbox(3).catch((e) => console.error("outbox", e))); // retry any unsent ticket email
  const s = STATUS[order.status];
  const paymentInFlight = order.status === "PENDING" && order.payments.length > 0;
  const transfer = paymentInFlight ? instructionsOf(order.payments[0].meta) : null;
  return (
    <main className="mx-auto max-w-2xl space-y-8 px-6 py-12">
      {paymentInFlight && <AutoRefresh />}
      <header>
        <p className="text-sm text-muted-foreground">Order {order.reference}</p>
        <h1 className="text-2xl font-semibold">{s.title}</h1>
        <p className="mt-2 text-muted-foreground">{s.body}</p>
      </header>
      <section className="space-y-1 text-sm">
        <p className="font-medium">{order.event.title}</p>
        <p className="text-muted-foreground">{formatInTz(order.event.startsAt, order.event.timezone)}</p>
        <p className="text-muted-foreground">Tickets for {maskEmail(order.buyerEmail)}</p>
      </section>
      <ul className="divide-y rounded-lg border text-sm">
        {order.items.map((it) => (
          <li key={it.id} className="flex justify-between p-4">
            <span>{it.quantity} x {it.ticketType.name}</span>
            <span>{formatMinor(it.unitPriceMinor * it.quantity, order.currency)}</span>
          </li>
        ))}
        <li className="flex justify-between p-4 font-semibold"><span>Total</span><span>{order.totalMinor === 0 ? "Free" : formatMinor(order.totalMinor, order.currency)}</span></li>
      </ul>
      {order.status === "PAID" && (
        <section className="space-y-3">
          <p className="text-sm text-muted-foreground">We have emailed your tickets to {maskEmail(order.buyerEmail)}. You can also open them here.</p>
          <ul className="divide-y rounded-lg border text-sm">
            {order.tickets.map((t) => (
              <li key={t.id} className="flex items-center justify-between p-4">
                <span>{t.ticketType.name} <span className="font-mono text-xs text-muted-foreground">{t.code}</span></span>
                <Link href={`/t/${t.qrToken}`} className="underline">Open ticket</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {order.status === "PENDING" && order.totalMinor > 0 && (
        <div className="space-y-3">
          {transfer && (
            <section aria-labelledby="transfer" className="space-y-3 rounded-lg border p-4 text-sm">
              <h2 id="transfer" className="font-semibold">Pay by bank transfer</h2>
              <p className="text-muted-foreground">Transfer exactly {formatMinor(transfer.amountMinor, order.currency)} to this account from any bank app. This page updates by itself once the payment arrives.</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt className="text-muted-foreground">Bank</dt><dd className="font-medium">{transfer.bankName}</dd>
                <dt className="text-muted-foreground">Account number</dt><dd className="font-mono text-base font-semibold">{transfer.accountNumber}</dd>
                <dt className="text-muted-foreground">Account name</dt><dd>{transfer.accountName}</dd>
                <dt className="text-muted-foreground">Amount</dt><dd className="font-semibold">{formatMinor(transfer.amountMinor, order.currency)}</dd>
              </dl>
              <p className="text-xs text-muted-foreground">This account is for this order only. Send the exact amount, once.</p>
            </section>
          )}
          {paymentInFlight && <p role="status" className="text-sm text-muted-foreground">Waiting for your payment...</p>}
          {order.expiresAt && <p className="text-sm text-muted-foreground">Held until {formatInTz(order.expiresAt, order.event.timezone)}.</p>}
          <PayButton reference={order.reference} label={transfer ? "Get new account details" : paymentInFlight ? "Pay again" : "Pay now"} />
        </div>
      )}
    </main>
  );
}
