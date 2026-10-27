"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { EventError, type Actor } from "@/lib/event-service";
import { addScannerStaff, removeScannerStaff, resetScannerPassword } from "@/lib/staff-service";

export type StaffState = { ok: boolean; message: string; email?: string; password?: string | null } | null;

async function who() {
  const u = await requireRole("ORGANIZER", "SUPER_ADMIN");
  const actor: Actor = { id: u.id, role: u.role };
  return actor;
}

const fail = (e: unknown): StaffState => {
  if (e instanceof EventError) return { ok: false, message: e.message };
  console.error(e);
  return { ok: false, message: "Something went wrong. Please try again." };
};

const refresh = (eventId: string) => {
  revalidatePath(`/organizer/events/${eventId}`);
  revalidatePath(`/admin/events/${eventId}`);
};

export async function addStaff(_: StaffState, form: FormData): Promise<StaffState> {
  const actor = await who();
  const parsed = z.object({ eventId: z.string().min(1), email: z.string().trim().email().max(254), name: z.string().trim().max(100).default("") }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Enter a valid email address." };
  try {
    const r = await addScannerStaff(actor, parsed.data.eventId, parsed.data.email, parsed.data.name);
    refresh(parsed.data.eventId);
    return { ok: true, message: r.password ? "Scanner login created. Copy the password now, it is shown only once." : "Existing scanner account assigned to this event.", email: r.email, password: r.password };
  } catch (e) {
    return fail(e);
  }
}

export async function staffAction(_: StaffState, form: FormData): Promise<StaffState> {
  const actor = await who();
  const parsed = z.object({ eventId: z.string().min(1), userId: z.string().min(1), intent: z.enum(["remove", "reset"]) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  try {
    if (parsed.data.intent === "remove") {
      await removeScannerStaff(actor, parsed.data.eventId, parsed.data.userId);
      refresh(parsed.data.eventId);
      return { ok: true, message: "Removed." };
    }
    const r = await resetScannerPassword(actor, parsed.data.eventId, parsed.data.userId);
    return { ok: true, message: "New password created. Copy it now, it is shown only once.", email: r.email, password: r.password };
  } catch (e) {
    return fail(e);
  }
}
