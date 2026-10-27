"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { EventError, getOwnedEvent, type Actor } from "@/lib/event-service";
import { parseTicketTypeForm } from "@/lib/ticket-types";
import { createTicketType, deleteTicketType, setTicketTypeActive, updateTicketType } from "@/lib/ticket-type-service";

type State = { ok: boolean; message: string } | null;

async function who() {
  const u = await requireRole("ORGANIZER", "SUPER_ADMIN");
  const actor: Actor = { id: u.id, role: u.role };
  return actor;
}

function toState(e: unknown): State {
  if (e instanceof EventError) return { ok: false, message: e.message };
  console.error(e);
  return { ok: false, message: "Something went wrong. Please try again." };
}

function refresh(eventId: string) {
  revalidatePath(`/organizer/events/${eventId}`);
  revalidatePath(`/admin/events/${eventId}`);
  revalidateTag("events");
}

export async function saveTicketType(_: State, form: FormData): Promise<State> {
  const actor = await who();
  const raw = Object.fromEntries(form);
  try {
    const eventId = z.string().min(1).parse(raw.eventId);
    const event = await getOwnedEvent(actor, eventId);
    const parsed = parseTicketTypeForm(raw, event.timezone);
    if (!parsed.ok) return { ok: false, message: parsed.error };
    if (typeof raw.id === "string" && raw.id) await updateTicketType(actor, raw.id, parsed.data);
    else await createTicketType(actor, eventId, parsed.data);
    refresh(eventId);
    return { ok: true, message: "Saved." };
  } catch (e) {
    return toState(e);
  }
}

export async function ticketTypeAction(_: State, form: FormData): Promise<State> {
  const actor = await who();
  try {
    const id = z.string().min(1).parse(form.get("id"));
    const eventId = z.string().min(1).parse(form.get("eventId"));
    const intent = z.enum(["activate", "deactivate", "delete"]).parse(form.get("intent"));
    if (intent === "delete") await deleteTicketType(actor, id);
    else await setTicketTypeActive(actor, id, intent === "activate");
    refresh(eventId);
    return { ok: true, message: "Done." };
  } catch (e) {
    return toState(e);
  }
}
