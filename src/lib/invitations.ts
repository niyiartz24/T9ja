import { Prisma, type InvitationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { generateToken, hashToken } from "@/lib/tokens";
import { hashPassword } from "@/lib/password";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const INVALID = "This invitation is invalid or has expired.";

export class InviteError extends Error {}

export function inviteState(inv: { status: InvitationStatus; expiresAt: Date }, now = new Date()) {
  if (inv.status !== "PENDING") return inv.status;
  return inv.expiresAt <= now ? "EXPIRED" : "PENDING";
}

const isUniqueViolation = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/** Returns the raw token exactly once; only its hash is stored. */
export async function createInvitation(actorId: string, rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  if (await db.user.findUnique({ where: { email } })) {
    throw new InviteError("A user with this email already exists.");
  }
  const token = generateToken();
  try {
    const invitation = await db.$transaction(async (tx) => {
      const now = new Date();
      await tx.organizerInvitation.updateMany({
        where: { email, status: "PENDING", expiresAt: { lte: now } },
        data: { status: "EXPIRED" },
      });
      if (await tx.organizerInvitation.findFirst({ where: { email, status: "PENDING" } })) {
        throw new InviteError("A pending invitation already exists for this email. Use Resend.");
      }
      const created = await tx.organizerInvitation.create({
        data: { email, tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + INVITE_TTL_MS), invitedById: actorId },
      });
      await tx.auditLog.create({
        data: { actorId, action: "invitation.create", entityType: "OrganizerInvitation", entityId: created.id, metadata: { email } },
      });
      return created;
    });
    return { invitation, token };
  } catch (e) {
    if (isUniqueViolation(e)) throw new InviteError("A pending invitation already exists for this email. Use Resend.");
    throw e;
  }
}

/** Resend rotates the token (old link dies) and extends expiry. */
export async function resendInvitation(actorId: string, id: string) {
  const token = generateToken();
  try {
    const result = await db.$transaction(async (tx) => {
      const updated = await tx.organizerInvitation.updateMany({
        where: { id, status: { in: ["PENDING", "EXPIRED"] } },
        data: { status: "PENDING", tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
      });
      if (updated.count !== 1) throw new InviteError("This invitation can no longer be resent.");
      const inv = await tx.organizerInvitation.findUniqueOrThrow({ where: { id } });
      await tx.auditLog.create({
        data: { actorId, action: "invitation.resend", entityType: "OrganizerInvitation", entityId: id },
      });
      return inv;
    });
    return { invitation: result, token };
  } catch (e) {
    if (isUniqueViolation(e)) throw new InviteError("Another pending invitation exists for this email.");
    throw e;
  }
}

export async function revokeInvitation(actorId: string, id: string) {
  const r = await db.organizerInvitation.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "REVOKED", revokedAt: new Date() },
  });
  if (r.count !== 1) throw new InviteError("Only pending invitations can be revoked.");
  await db.auditLog.create({
    data: { actorId, action: "invitation.revoke", entityType: "OrganizerInvitation", entityId: id },
  });
}

/** Read-only check used to render the accept page. */
export async function findOpenInvitation(token: string) {
  const inv = await db.organizerInvitation.findUnique({ where: { tokenHash: hashToken(token) } });
  return inv && inviteState(inv) === "PENDING" ? inv : null;
}

/** Atomic: the conditional update claims the invitation, so concurrent accepts cannot both win. */
export async function acceptInvitation(token: string, input: { name: string; password: string }) {
  const passwordHash = await hashPassword(input.password);
  return db.$transaction(async (tx) => {
    const inv = await tx.organizerInvitation.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!inv) throw new InviteError(INVALID);
    const claimed = await tx.organizerInvitation.updateMany({
      where: { id: inv.id, status: "PENDING", expiresAt: { gt: new Date() } },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });
    if (claimed.count !== 1) throw new InviteError(INVALID);
    if (await tx.user.findUnique({ where: { email: inv.email } })) throw new InviteError(INVALID);
    const user = await tx.user.create({
      data: { email: inv.email, name: input.name, passwordHash, role: "ORGANIZER", emailVerified: new Date() },
    });
    await tx.auditLog.create({
      data: { actorId: user.id, action: "invitation.accept", entityType: "OrganizerInvitation", entityId: inv.id },
    });
    return user;
  });
}
