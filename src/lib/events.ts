import { z } from "zod";

export const TIMEZONES = [
  "Africa/Lagos", "Africa/Accra", "Africa/Nairobi", "Africa/Johannesburg",
  "Europe/London", "America/New_York", "UTC",
] as const;

export function slugify(input: string): string {
  return (
    input.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "") || "event"
  );
}

function wallParts(utcMs: number, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { y: g("year"), mo: g("month"), d: g("day"), h: g("hour"), mi: g("minute"), s: g("second") };
}

function offsetMs(utcMs: number, tz: string) {
  const w = wallParts(utcMs, tz);
  return Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - Math.floor(utcMs / 1000) * 1000;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** UTC Date -> "YYYY-MM-DDTHH:mm" wall time in tz (for datetime-local inputs). */
export function utcToZonedInput(date: Date, tz: string): string {
  const w = wallParts(date.getTime(), tz);
  return `${w.y}-${pad(w.mo)}-${pad(w.d)}T${pad(w.h)}:${pad(w.mi)}`;
}

/** "YYYY-MM-DDTHH:mm" wall time in tz -> UTC Date. Returns null if invalid or nonexistent (DST gap). */
export function zonedToUtc(local: string, tz: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const [y, mo, d, h, mi] = local.split(/[-T:]/).map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let utc = guess - offsetMs(guess, tz);
  utc = guess - offsetMs(utc, tz);
  const date = new Date(utc);
  if (isNaN(date.getTime())) return null;
  return utcToZonedInput(date, tz) === local ? date : null;
}

export function formatInTz(date: Date, tz: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }).format(date);
}

export type EventInput = {
  title: string; description: string;
  venueName: string | null; venueAddress: string | null;
  isOnline: boolean; onlineUrl: string | null;
  timezone: string; startsAt: Date; endsAt: Date;
  salesOpenAt: Date | null; salesCloseAt: Date | null;
  coverImage: string | null;
};

/** Local dev path, or a file under the configured public storage URL. Never an arbitrary URL. */
export function isValidCoverUrl(v: string): boolean {
  if (/^\/uploads\/covers\/[a-f0-9]{32}\.(png|jpg|webp)$/.test(v)) return true;
  const base = process.env.STORAGE_PUBLIC_URL?.replace(/\/+$/, "");
  if (!base) return false;
  return v.startsWith(`${base}/covers/`) && /^[a-f0-9]{32}\.(png|jpg|webp)$/.test(v.slice(base.length + "/covers/".length));
}

const text = (max: number) => z.string().trim().max(max).default("");

const formSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(120),
  description: text(10000),
  venueName: text(120),
  venueAddress: text(250),
  isOnline: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  onlineUrl: text(500).refine((v) => {
    if (!v) return true;
    try { return new URL(v).protocol === "https:"; } catch { return false; }
  }, "Online event link must be a valid https URL"),
  timezone: z.string().refine((v) => (TIMEZONES as readonly string[]).includes(v), "Choose a valid timezone"),
  startsAt: z.string().min(1, "Start date is required"),
  endsAt: z.string().min(1, "End date is required"),
  salesOpenAt: text(20),
  salesCloseAt: text(20),
  coverImage: text(300).refine((v) => !v || isValidCoverUrl(v), "Invalid cover image"),
});

export function parseEventForm(raw: Record<string, unknown>): { ok: true; data: EventInput } | { ok: false; error: string } {
  const p = formSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const v = p.data;
  const startsAt = zonedToUtc(v.startsAt, v.timezone);
  const endsAt = zonedToUtc(v.endsAt, v.timezone);
  if (!startsAt || !endsAt) return { ok: false, error: "Enter valid start and end dates." };
  if (endsAt <= startsAt) return { ok: false, error: "The event must end after it starts." };
  const optional = (s: string) => (s ? zonedToUtc(s, v.timezone) : null);
  const salesOpenAt = optional(v.salesOpenAt);
  const salesCloseAt = optional(v.salesCloseAt);
  if ((v.salesOpenAt && !salesOpenAt) || (v.salesCloseAt && !salesCloseAt)) {
    return { ok: false, error: "Enter valid ticket sales dates." };
  }
  if (salesOpenAt && salesCloseAt && salesCloseAt <= salesOpenAt) {
    return { ok: false, error: "Ticket sales must close after they open." };
  }
  if (salesCloseAt && salesCloseAt > endsAt) {
    return { ok: false, error: "Ticket sales cannot close after the event ends." };
  }
  return {
    ok: true,
    data: {
      title: v.title, description: v.description,
      venueName: v.venueName || null, venueAddress: v.venueAddress || null,
      isOnline: v.isOnline, onlineUrl: v.onlineUrl || null,
      timezone: v.timezone, startsAt, endsAt, salesOpenAt, salesCloseAt,
      coverImage: v.coverImage || null,
    },
  };
}

/** Returns the list of problems preventing publication (empty = publishable). */
export function publishProblems(
  e: Pick<EventInput, "title" | "description" | "venueName" | "venueAddress" | "isOnline" | "onlineUrl" | "endsAt">,
  activeTicketTypes: number,
  now = new Date(),
): string[] {
  const problems: string[] = [];
  if (e.description.trim().length < 30) problems.push("Add a description of at least 30 characters");
  if (e.isOnline) {
    if (!e.onlineUrl) problems.push("Add the online event link");
  } else if (!e.venueName || !e.venueAddress) {
    problems.push("Add the venue name and address");
  }
  if (e.endsAt <= now) problems.push("The event end time is in the past");
  if (activeTicketTypes < 1) problems.push("Add at least one active ticket type");
  return problems;
}

/** What the public site may show. Used by discovery in Phase 6. */
export const publicEventWhere = (now = new Date()) => ({ status: "PUBLISHED" as const, endsAt: { gt: now } });
