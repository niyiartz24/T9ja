"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { addCollaborator, removeCollaborator } from "@/lib/collaborator-service";
import { EventError, type Actor } from "@/lib/event-service";
import { processOutbox } from "@/lib/outbox";

type State = { ok: boolean; message: string } | null;

const fail = (e: unknown): State => {
  if (e instanceof EventError) return { ok: false, message: e.message };
  console.error(e);
  return { ok: false, message: "Something went wrong. Please try again." };
};

const refresh = (eventId: string) => {
  revalidatePath(`/organizer/events/${eventId}`);
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath("/organizer/events");
};

export async function addOrganizer(_: State, form: FormData): Promise<State> {
  const u = await requireRole("ORGANIZER", "SUPER_ADMIN");
  const actor: Actor = { id: u.id, role: u.role };
  const parsed = z.object({ eventId: z.string().min(1), email: z.string().trim().email().max(254) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Enter the organizer's email address." };
  try {
    await addCollaborator(actor, parsed.data.eventId, parsed.data.email);
  } catch (e) {
    return fail(e);
  }
  after(() => processOutbox(3).catch((e) => console.error("outbox", e)));
  refresh(parsed.data.eventId);
  return { ok: true, message: "Organizer added. They can now see and manage this event." };
}

export async function removeOrganizer(_: State, form: FormData): Promise<State> {
  const u = await requireRole("ORGANIZER", "SUPER_ADMIN");
  const actor: Actor = { id: u.id, role: u.role };
  const parsed = z.object({ eventId: z.string().min(1), userId: z.string().min(1) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  try {
    await removeCollaborator(actor, parsed.data.eventId, parsed.data.userId);
  } catch (e) {
    return fail(e);
  }
  refresh(parsed.data.eventId);
  if (parsed.data.userId === actor.id && actor.role === "ORGANIZER") redirect("/organizer/events"); // you just left: this event is no longer yours to see
  return { ok: true, message: "Removed." };
}
