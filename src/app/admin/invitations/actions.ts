"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createInvitation, resendInvitation, revokeInvitation, InviteError } from "@/lib/invitations";
import { invitationEmail, sendEmail } from "@/lib/email";

type State = { ok: boolean; message: string } | null;

async function deliver(email: string, token: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const link = `${process.env.APP_URL}/invite/${token}`;
  try {
    await sendEmail({ to: email, ...invitationEmail(link) });
    return { ok: true };
  } catch (e) {
    console.error("invitation email failed", e);
    return { ok: false, reason: (e instanceof Error ? e.message : "unknown error").slice(0, 250) };
  }
}

const fail = (e: unknown): State => {
  if (e instanceof InviteError) return { ok: false, message: e.message };
  console.error(e);
  return { ok: false, message: "Something went wrong. Please try again." };
};

export async function inviteOrganizer(_: State, form: FormData): Promise<State> {
  const admin = await requireRole("SUPER_ADMIN");
  const parsed = z.string().email().max(254).safeParse(form.get("email"));
  if (!parsed.success) return { ok: false, message: "Enter a valid email address." };
  try {
    const { invitation, token } = await createInvitation(admin.id, parsed.data);
    const sent = await deliver(invitation.email, token);
    revalidatePath("/admin/invitations");
    return sent.ok
      ? { ok: true, message: `Invitation sent to ${invitation.email}.` }
      : { ok: false, message: `Invitation created but the email could not be sent (${sent.reason}). Fix that, then use Resend.` };
  } catch (e) {
    return fail(e);
  }
}

export async function resend(_: State, form: FormData): Promise<State> {
  const admin = await requireRole("SUPER_ADMIN");
  const id = z.string().min(1).safeParse(form.get("id"));
  if (!id.success) return { ok: false, message: "Invalid invitation." };
  try {
    const { invitation, token } = await resendInvitation(admin.id, id.data);
    const sent = await deliver(invitation.email, token);
    revalidatePath("/admin/invitations");
    return sent.ok
      ? { ok: true, message: `Invitation resent to ${invitation.email}. The old link no longer works.` }
      : { ok: false, message: `A new link was created but the email could not be sent (${sent.reason}).` };
  } catch (e) {
    return fail(e);
  }
}

export async function revoke(_: State, form: FormData): Promise<State> {
  const admin = await requireRole("SUPER_ADMIN");
  const id = z.string().min(1).safeParse(form.get("id"));
  if (!id.success) return { ok: false, message: "Invalid invitation." };
  try {
    await revokeInvitation(admin.id, id.data);
    revalidatePath("/admin/invitations");
    return { ok: true, message: "Invitation revoked." };
  } catch (e) {
    return fail(e);
  }
}
