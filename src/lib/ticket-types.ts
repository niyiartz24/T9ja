import { z } from "zod";
import { zonedToUtc } from "@/lib/events";
import { parseMajorToMinor } from "@/lib/money";

export const CURRENCIES = ["NGN"] as const;
export const MAX_TICKETS_PER_ORDER = 50;

export type TicketTypeInput = {
  name: string; description: string | null; priceMinor: number; currency: string;
  quantityTotal: number; minPerOrder: number; maxPerOrder: number;
  salesOpenAt: Date | null; salesCloseAt: Date | null; isActive: boolean;
};

const int = (label: string, min: number, max: number) =>
  z.coerce.number({ message: `${label} must be a number` }).int(`${label} must be a whole number`).min(min, `${label} must be at least ${min}`).max(max, `${label} must be at most ${max}`);

const schema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
  description: z.string().trim().max(500).default(""),
  price: z.string().default(""),
  quantityTotal: int("Quantity", 1, 100000),
  minPerOrder: int("Minimum per order", 1, MAX_TICKETS_PER_ORDER).default(1),
  maxPerOrder: int("Maximum per order", 1, MAX_TICKETS_PER_ORDER).default(10),
  salesOpenAt: z.string().default(""),
  salesCloseAt: z.string().default(""),
  isActive: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
});

export function parseTicketTypeForm(
  raw: Record<string, unknown>,
  timezone: string,
): { ok: true; data: TicketTypeInput } | { ok: false; error: string } {
  const p = schema.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const v = p.data;
  const priceMinor = parseMajorToMinor(v.price);
  if (priceMinor === null) return { ok: false, error: "Enter a valid price, such as 2500 or 2500.50 (use 0 for free)." };
  if (v.minPerOrder > v.maxPerOrder) return { ok: false, error: "Minimum per order cannot exceed the maximum." };
  if (v.minPerOrder > v.quantityTotal) return { ok: false, error: "Minimum per order cannot exceed the total quantity." };
  const open = v.salesOpenAt ? zonedToUtc(v.salesOpenAt, timezone) : null;
  const close = v.salesCloseAt ? zonedToUtc(v.salesCloseAt, timezone) : null;
  if ((v.salesOpenAt && !open) || (v.salesCloseAt && !close)) return { ok: false, error: "Enter valid sales dates." };
  if (open && close && close <= open) return { ok: false, error: "Sales must close after they open." };
  return {
    ok: true,
    data: {
      name: v.name, description: v.description || null, priceMinor, currency: "NGN",
      quantityTotal: v.quantityTotal, minPerOrder: v.minPerOrder, maxPerOrder: v.maxPerOrder,
      salesOpenAt: open, salesCloseAt: close, isActive: v.isActive,
    },
  };
}

export const available = (t: { quantityTotal: number; quantitySold: number; quantityReserved: number }) =>
  Math.max(0, t.quantityTotal - t.quantitySold - t.quantityReserved);

const latest = (a: Date | null, b: Date | null) => (a && b ? (a > b ? a : b) : a ?? b);
const earliest = (a: Date | null, b: Date | null) => (a && b ? (a < b ? a : b) : a ?? b);

/** Null when on sale; otherwise a customer-safe reason. Event and ticket windows both apply. */
export function salesWindowProblem(
  event: { status: string; endsAt: Date; salesOpenAt: Date | null; salesCloseAt: Date | null },
  tt: { salesOpenAt: Date | null; salesCloseAt: Date | null },
  now = new Date(),
): string | null {
  if (event.status !== "PUBLISHED") return "Tickets are not on sale for this event.";
  if (event.endsAt <= now) return "This event has ended.";
  const open = latest(event.salesOpenAt, tt.salesOpenAt);
  if (open && now < open) return "Ticket sales have not opened yet.";
  const close = earliest(event.salesCloseAt, tt.salesCloseAt);
  if (close && now >= close) return "Ticket sales have closed.";
  return null;
}
