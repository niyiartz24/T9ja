"use server";
import { allow } from "@/lib/rate-limit";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createSession, destroySession, homeFor } from "@/lib/auth";

const schema = z.object({ email: z.string().email().toLowerCase(), password: z.string().min(1).max(200) });

// Precomputed so unknown emails cost the same as wrong passwords.
const DUMMY = "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$7mQ6Zk0m4m9r3q0Z2yQ9vZ0m8hJm2o2m1m2m3m4m5m6";

export async function login(_: unknown, form: FormData) {
  if (!(await allow("login", 10, 600))) return { error: "Too many attempts. Try again in a few minutes." };
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Enter a valid email and password." };
  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  const ok = await verifyPassword(user?.passwordHash ?? DUMMY, parsed.data.password);
  if (!user || !ok || user.status !== "ACTIVE") return { error: "Invalid email or password." };
  await createSession(user.id);
  await db.auditLog.create({ data: { actorId: user.id, action: "auth.login", entityType: "User", entityId: user.id } });
  redirect(homeFor(user.role));
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
