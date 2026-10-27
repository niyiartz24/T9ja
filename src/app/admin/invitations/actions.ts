"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createInvitation, resendInvitation, revokeInvitation, InviteError } from "@/lib/invitations";
import { invitationEmail, sendEmail } from "@/lib/email";

type State = { ok: boolean; message: string } | null;

async function deliver(email: string, token: string) {
  const link = `${process.env.APP_URL}/invite/${token}`;
  try {
    await sendEmail({ to: email, ...invitationEmail(link) });
    return true;
  } catch (e) {
    console.error("invitation email failed", e);
    return false;
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
    return sent
      ? { ok: true, message: `Invitation sent to ${invitation.email}.` }
      : { ok: false, message: "Invitation created but the email failed to send. Use Resend." };
  } catch (e) {
    return fail(e);
  }
}

export async function resend(form: FormData) {
  const admin = await requireRole("SUPER_ADMIN");
  const id = z.string().min(1).parse(form.get("id"));
  try {
    const { invitation, token } = await resendInvitation(admin.id, id);
    await deliver(invitation.email, token);
  } catch (e) {
    console.error(e);
  }
  revalidatePath("/admin/invitations");
}

export async function revoke(form: FormData) {
  const admin = await requireRole("SUPER_ADMIN");
  const id = z.string().min(1).parse(form.get("id"));
  try {
    await revokeInvitation(admin.id, id);
  } catch (e) {
    console.error(e);
  }
  revalidatePath("/admin/invitations");
}
