"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function setOrganizerStatus(form: FormData) {
  const admin = await requireRole("SUPER_ADMIN");
  const id = z.string().min(1).parse(form.get("id"));
  const status = z.enum(["ACTIVE", "SUSPENDED"]).parse(form.get("status"));
  const r = await db.user.updateMany({ where: { id, role: "ORGANIZER" }, data: { status } });
  if (r.count === 1) {
    if (status === "SUSPENDED") await db.session.deleteMany({ where: { userId: id } });
    await db.auditLog.create({
      data: { actorId: admin.id, action: `organizer.${status.toLowerCase()}`, entityType: "User", entityId: id },
    });
  }
  revalidatePath("/admin/organizers");
}
