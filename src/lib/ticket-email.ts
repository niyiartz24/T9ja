import { formatInTz } from "@/lib/events";
import { formatMinor } from "@/lib/money";

export type TicketEmailData = {
  buyerName: string;
  orderReference: string;
  appUrl: string;
  event: { title: string; startsAt: Date; endsAt: Date; timezone: string; venueName: string | null; venueAddress: string | null; isOnline: boolean; onlineUrl: string | null };
  tickets: { code: string; qrToken: string; typeName: string }[];
  receipt?: { totalMinor: number; currency: string; referralCode: string | null };
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/**
 * The QR image URL contains only the opaque ticket token: no name, email or event details.
 * Every user-supplied value is HTML-escaped.
 */
export function ticketsEmail(d: TicketEmailData): { subject: string; html: string; text: string } {
  const base = d.appUrl.replace(/\/+$/, "");
  const when = `${formatInTz(d.event.startsAt, d.event.timezone)} (${d.event.timezone})`;
  const where = d.event.isOnline ? `Online: ${d.event.onlineUrl ?? "link to follow"}` : [d.event.venueName, d.event.venueAddress].filter(Boolean).join(", ") || "Venue to be announced";
  const n = d.tickets.length;
  const subject = `Your ${n === 1 ? "ticket" : "tickets"} for ${d.event.title}`;

  const cards = d.tickets.map((t) => `
    <div style="border:1px solid #e5e5e5;border-radius:8px;padding:16px;margin:16px 0;text-align:center">
      <p style="margin:0 0 4px;font-weight:600">${esc(t.typeName)}</p>
      <p style="margin:0 0 12px;font-family:monospace;font-size:16px">${esc(t.code)}</p>
      <img src="${base}/api/tickets/${t.qrToken}/qr" width="200" height="200" alt="QR code for ticket ${esc(t.code)}" style="display:block;margin:0 auto" />
      <p style="margin:12px 0 0;font-size:13px"><a href="${base}/t/${t.qrToken}">Open this ticket</a></p>
    </div>`).join("");

  const r = d.receipt;
  const total = r ? formatMinor(r.totalMinor, r.currency) : null;
  const receiptHtml = r ? `
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
      <tr><td style="padding:4px 0;color:#555">Order</td><td style="text-align:right">${esc(d.orderReference)}</td></tr>
      <tr><td style="padding:4px 0;color:#555">Total paid</td><td style="text-align:right">${esc(total ?? "")}</td></tr>
      ${r.referralCode ? `<tr><td style="padding:4px 0;color:#555">Referral code</td><td style="text-align:right;font-family:monospace">${esc(r.referralCode)}</td></tr>` : ""}
    </table>` : "";
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
    <h1 style="font-size:20px">You're going to ${esc(d.event.title)}</h1>
    <p>Hi ${esc(d.buyerName)}, your order <strong>${esc(d.orderReference)}</strong> is confirmed.</p>
    <p style="margin:0">${esc(when)}<br>${esc(where)}</p>
    ${receiptHtml}
    ${cards}
    <p style="font-size:13px;color:#555">Show the QR code at the entrance. Each ticket admits one person and works once. If the image does not load, open the ticket link or give the ticket ID to the door staff.</p>
  </div>`;

  const text = [
    `Hi ${d.buyerName}, your order ${d.orderReference} for ${d.event.title} is confirmed.`,
    `${when}`, where, "",
    ...(r ? [`Total paid: ${total}`, ...(r.referralCode ? [`Referral code: ${r.referralCode}`] : []), ""] : []),
    ...d.tickets.map((t) => `${t.typeName}  ${t.code}\n${base}/t/${t.qrToken}`),
    "", "Show the QR code at the entrance. Each ticket admits one person and works once.",
  ].join("\n");

  return { subject, html, text };
}
