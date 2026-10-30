/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatInTz } from "@/lib/events";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Your ticket | Ticket9ja", robots: { index: false, follow: false } };

const NOTE: Record<string, string> = {
  VALID: "Show this QR code at the entrance. It admits one person and works once.",
  USED: "This ticket has already been used for entry.",
  CANCELLED: "This ticket has been cancelled and will not be accepted.",
  REFUNDED: "This ticket was refunded and will not be accepted.",
};

export default async function TicketPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) notFound();
  const t = await db.ticket.findUnique({
    where: { qrToken: token },
    select: {
      code: true, status: true, holderName: true, order: { select: { referralCode: true } },
      ticketType: { select: { name: true } },
      event: { select: { title: true, startsAt: true, timezone: true, venueName: true, venueAddress: true, isOnline: true, onlineUrl: true } },
    },
  });
  if (!t) notFound();
  const where = t.event.isOnline ? `Online: ${t.event.onlineUrl ?? "link to follow"}` : [t.event.venueName, t.event.venueAddress].filter(Boolean).join(", ");
  return (
    <main className="mx-auto max-w-sm space-y-6 px-6 py-10 text-center">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{t.event.title}</h1>
        <p className="text-sm text-muted-foreground">{formatInTz(t.event.startsAt, t.event.timezone)}</p>
        {where && <p className="text-sm text-muted-foreground">{where}</p>}
      </div>
      <div className="space-y-3 rounded-lg border p-6">
        <Badge variant={t.status === "VALID" ? "default" : "secondary"}>{t.status}</Badge>
        {t.status === "VALID" && <img src={`/api/tickets/${token}/qr`} alt={`QR code for ticket ${t.code}`} width={260} height={260} className="mx-auto" />}
        <p className="font-mono text-lg">{t.code}</p>
        <p className="text-sm">{t.ticketType.name} for {t.holderName}</p>
        {t.order.referralCode && <p className="text-xs text-muted-foreground">Referral code <span className="font-mono">{t.order.referralCode}</span></p>}
      </div>
      <p className="text-sm text-muted-foreground">{NOTE[t.status]}</p>
    </main>
  );
}
