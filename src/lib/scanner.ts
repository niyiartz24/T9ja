import { db } from "@/lib/db";
import type { Actor } from "@/lib/event-service";

export class ScanAuthError extends Error {}

export type ScanView = {
  outcome: "ADMITTED" | "DUPLICATE" | "WRONG_EVENT" | "NOT_FOUND" | "INVALID_STATUS";
  title: string;
  detail: string;
  ticket?: { code: string; holderName: string; typeName: string; usedAt?: string };
};

/** Crockford-style forgiving entry for hand-typed IDs (O->0, I/L->1, U->V). QR scans carry the 32-char token. */
export function normalizeScanInput(raw: string): { kind: "code" | "token"; value: string } | null {
  const s = raw.trim().replace(/\s+/g, "");
  if (/^[A-Za-z0-9_-]{32}$/.test(s)) return { kind: "token", value: s };
  const compact = s.replace(/-/g, "").toUpperCase().replace(/O/g, "0").replace(/[IL]/g, "1").replace(/U/g, "V");
  if (/^[0-9A-Z]{12}$/.test(compact) && /^[0-9A-Za-z-]+$/.test(s)) {
    return { kind: "code", value: `${compact.slice(0, 4)}-${compact.slice(4, 8)}-${compact.slice(8, 12)}` };
  }
  return null;
}

export async function canScanEvent(actor: Actor, eventId: string): Promise<boolean> {
  const pick = { select: { id: true } };
  if (actor.role === "SUPER_ADMIN") return !!(await db.event.findUnique({ where: { id: eventId }, ...pick }));
  if (actor.role === "ORGANIZER") return !!(await db.event.findFirst({ where: { id: eventId, organizerId: actor.id }, ...pick }));
  if (actor.role === "STAFF") return !!(await db.eventStaff.findUnique({ where: { eventId_userId: { eventId, userId: actor.id } }, ...pick }));
  return false;
}

/**
 * Server-authoritative validation. The only thing that admits a ticket is the conditional UPDATE below:
 * it succeeds for exactly one caller, so two devices scanning the same ticket at the same instant
 * can never both be admitted. Nothing is decided from client state.
 */
export async function scanTicket(actor: Actor, eventId: string, rawInput: string): Promise<ScanView> {
  if (!(await canScanEvent(actor, eventId))) throw new ScanAuthError();
  const input = String(rawInput).slice(0, 100);
  const record = (result: "ADMITTED" | "DUPLICATE" | "WRONG_EVENT" | "NOT_FOUND" | "INVALID_STATUS", ticketId?: string) =>
    db.ticketScan.create({ data: { eventId, scannerId: actor.id, result, ticketId: ticketId ?? null, input } });

  const notFound: ScanView = { outcome: "NOT_FOUND", title: "Ticket not found", detail: "This code is not a valid Ticket9ja ticket." };
  const parsed = normalizeScanInput(input);
  if (!parsed) { await record("NOT_FOUND"); return notFound; }

  const ticket = await db.ticket.findFirst({
    where: parsed.kind === "code" ? { code: parsed.value } : { qrToken: parsed.value },
    include: { ticketType: { select: { name: true } }, event: { select: { title: true, status: true } }, order: { select: { status: true } } },
  });
  if (!ticket) { await record("NOT_FOUND"); return notFound; }

  const info = { code: ticket.code, holderName: ticket.holderName, typeName: ticket.ticketType.name };
  if (ticket.eventId !== eventId) {
    await record("WRONG_EVENT", ticket.id);
    return { outcome: "WRONG_EVENT", title: "Wrong event", detail: `This ticket is for "${ticket.event.title}".`, ticket: info };
  }
  const current = await db.event.findUnique({ where: { id: eventId }, select: { status: true } });
  if (current?.status === "CANCELLED") {
    await record("INVALID_STATUS", ticket.id);
    return { outcome: "INVALID_STATUS", title: "Event cancelled", detail: "This event has been cancelled.", ticket: info };
  }
  if (ticket.order.status !== "PAID") {
    await record("INVALID_STATUS", ticket.id);
    return { outcome: "INVALID_STATUS", title: "Not paid", detail: "The order for this ticket is not paid.", ticket: info };
  }
  if (ticket.status === "CANCELLED" || ticket.status === "REFUNDED") {
    await record("INVALID_STATUS", ticket.id);
    return { outcome: "INVALID_STATUS", title: `Ticket ${ticket.status.toLowerCase()}`, detail: "This ticket is no longer valid.", ticket: info };
  }
  if (ticket.status === "USED") {
    await record("DUPLICATE", ticket.id);
    return { outcome: "DUPLICATE", title: "Already used", detail: `Admitted earlier${ticket.usedAt ? ` at ${ticket.usedAt.toISOString().slice(11, 16)} UTC` : ""}.`, ticket: { ...info, usedAt: ticket.usedAt?.toISOString() } };
  }

  const won = await db.$transaction(async (tx) => {
    const r = await tx.ticket.updateMany({
      where: { id: ticket.id, eventId, status: "VALID" },
      data: { status: "USED", usedAt: new Date(), usedById: actor.id },
    });
    if (r.count === 1) await tx.ticketScan.create({ data: { eventId, scannerId: actor.id, result: "ADMITTED", ticketId: ticket.id, input } });
    return r.count === 1;
  });
  if (won) return { outcome: "ADMITTED", title: "Admit", detail: `${ticket.ticketType.name} for ${ticket.holderName}`, ticket: info };

  // Lost a race (another device admitted it first) or the ticket changed state in the meantime.
  const now = await db.ticket.findUnique({ where: { id: ticket.id }, select: { status: true, usedAt: true } });
  if (now?.status === "USED") {
    await record("DUPLICATE", ticket.id);
    return { outcome: "DUPLICATE", title: "Already used", detail: "This ticket was just admitted on another device.", ticket: { ...info, usedAt: now.usedAt?.toISOString() } };
  }
  await record("INVALID_STATUS", ticket.id);
  return { outcome: "INVALID_STATUS", title: "Ticket not valid", detail: "This ticket can no longer be used.", ticket: info };
}

export async function scanStats(eventId: string) {
  const rows = await db.ticket.groupBy({ by: ["status"], where: { eventId }, _count: true });
  const n = (s: string) => rows.find((r) => r.status === s)?._count ?? 0;
  return { admitted: n("USED"), remaining: n("VALID"), total: n("USED") + n("VALID") };
}

export async function recentScans(actor: Actor, eventId: string, take = 15) {
  if (!(await canScanEvent(actor, eventId))) throw new ScanAuthError();
  const rows = await db.ticketScan.findMany({
    where: { eventId }, orderBy: { createdAt: "desc" }, take,
    select: { id: true, result: true, createdAt: true, ticket: { select: { code: true, holderName: true } }, scanner: { select: { name: true, email: true } } },
  });
  return rows.map((r) => ({ id: r.id, result: r.result, at: r.createdAt.toISOString(), code: r.ticket?.code ?? null, holder: r.ticket?.holderName ?? null, by: r.scanner.name ?? r.scanner.email }));
}
