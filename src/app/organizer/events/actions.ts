"use server";
import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { parseEventForm } from "@/lib/events";
import { EventError, cancelEvent, createEvent, publishEvent, unpublishEvent, updateEvent, type Actor } from "@/lib/event-service";

type State = { ok: boolean; message: string } | null;

async function who() {
  const u = await requireRole("ORGANIZER", "SUPER_ADMIN");
  const actor: Actor = { id: u.id, role: u.role };
  return { actor, base: u.role === "SUPER_ADMIN" ? "/admin/events" : "/organizer/events" };
}

function toState(e: unknown): State {
  if (e instanceof EventError) return { ok: false, message: e.message };
  console.error(e);
  return { ok: false, message: "Something went wrong. Please try again." };
}

export async function saveEvent(_: State, form: FormData): Promise<State> {
  const { actor, base } = await who();
  const raw = Object.fromEntries(form);
  const parsed = parseEventForm(raw);
  if (!parsed.ok) return { ok: false, message: parsed.error };
  const id = typeof raw.id === "string" && raw.id ? raw.id : null;
  const ownerId = typeof raw.ownerId === "string" && raw.ownerId ? raw.ownerId : undefined;
  let eventId: string;
  try {
    if (id) {
      await updateEvent(actor, id, parsed.data);
      eventId = id;
    } else {
      eventId = (await createEvent(actor, parsed.data, ownerId)).id;
    }
  } catch (e) {
    return toState(e);
  }
  revalidatePath(base);
  revalidateTag("events");
  if (!id) redirect(`${base}/${eventId}`);
  return { ok: true, message: "Saved." };
}

export async function changeStatus(_: State, form: FormData): Promise<State> {
  const { actor, base } = await who();
  const id = z.string().min(1).parse(form.get("id"));
  const intent = z.enum(["publish", "unpublish", "cancel"]).parse(form.get("intent"));
  try {
    if (intent === "publish") await publishEvent(actor, id);
    if (intent === "unpublish") await unpublishEvent(actor, id);
    if (intent === "cancel") await cancelEvent(actor, id);
  } catch (e) {
    return toState(e);
  }
  revalidatePath(`${base}/${id}`);
  revalidatePath(base);
  revalidateTag("events");
  return { ok: true, message: intent === "publish" ? "Event published." : intent === "unpublish" ? "Event moved back to draft." : "Event cancelled." };
}
