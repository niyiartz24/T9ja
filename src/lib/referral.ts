import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const REFERRAL_RE = /^REF-[0-9A-Z]{6}$/;

export const newReferralCode = () => "REF-" + Array.from(randomBytes(6), (b) => ALPHABET[b & 31]).join("");

/** Returns a clean code or null. Anything that is not exactly REF-XXXXXX is ignored. */
export function normalizeReferral(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toUpperCase().slice(0, 20);
  return REFERRAL_RE.test(s) ? s : null;
}

/** Every organizer (and the Super Admin) has one permanent, unique code. Created on first use. */
export async function ensureReferralCode(userId: string): Promise<string> {
  const existing = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { referralCode: true } });
  if (existing.referralCode) return existing.referralCode;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await db.user.updateMany({ where: { id: userId, referralCode: null }, data: { referralCode: newReferralCode() } });
      break;
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e; // collision: try another
    }
  }
  const after = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { referralCode: true } });
  if (!after.referralCode) throw new Error("Could not create a referral code");
  return after.referralCode;
}

/**
 * The code recorded on an order: the one carried by the link if it belongs to a real active organizer (or admin),
 * otherwise the event owner's own code. A made-up code is never stored.
 */
export async function resolveReferral(ownerId: string, fromLink?: unknown): Promise<string> {
  const code = normalizeReferral(fromLink);
  if (code) {
    const hit = await db.user.findFirst({
      where: { referralCode: code, status: "ACTIVE", role: { in: ["ORGANIZER", "SUPER_ADMIN"] } },
      select: { referralCode: true },
    });
    if (hit?.referralCode) return hit.referralCode;
  }
  return ensureReferralCode(ownerId);
}
