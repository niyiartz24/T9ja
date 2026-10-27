"use server";
import { requireRole } from "@/lib/auth";
import { consume } from "@/lib/rate-limit-core";
import { ScanAuthError, recentScans, scanStats, scanTicket } from "@/lib/scanner";

export async function scanAction(eventId: string, input: string) {
  const user = await requireRole("STAFF", "ORGANIZER", "SUPER_ADMIN");
  if (typeof eventId !== "string" || typeof input !== "string") return { ok: false as const, error: "Invalid request." };
  if (!(await consume(`scan:${user.id}`, 150, 60).catch(() => true))) return { ok: false as const, error: "Scanning too fast. Wait a moment." };
  const actor = { id: user.id, role: user.role };
  try {
    const view = await scanTicket(actor, eventId, input);
    const [stats, recent] = await Promise.all([scanStats(eventId), recentScans(actor, eventId)]);
    return { ok: true as const, view, stats, recent };
  } catch (e) {
    if (e instanceof ScanAuthError) return { ok: false as const, error: "You are not authorised to scan this event." };
    console.error("scan failed", e);
    return { ok: false as const, error: "Validation failed on the server. Try again." };
  }
}
