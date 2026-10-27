"use server";
import { allow } from "@/lib/rate-limit";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession } from "@/lib/auth";
import { acceptInvitation, InviteError } from "@/lib/invitations";

const schema = z
  .object({
    token: z.string().min(20).max(100),
    name: z.string().trim().min(2).max(100),
    password: z.string().min(12, "Password must be at least 12 characters").max(128),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Passwords do not match", path: ["confirm"] });

export async function acceptInviteAction(_: unknown, form: FormData) {
  if (!(await allow("invite-accept", 10, 600))) return { error: "Too many attempts. Try again in a few minutes." };
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  let userId: string;
  try {
    userId = (await acceptInvitation(parsed.data.token, { name: parsed.data.name, password: parsed.data.password })).id;
  } catch (e) {
    if (e instanceof InviteError) return { error: e.message };
    console.error(e);
    return { error: "Something went wrong. Please try again." };
  }
  await createSession(userId);
  redirect("/organizer");
}
