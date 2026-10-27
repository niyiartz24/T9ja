import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

describe.skipIf(!url)("invitations (database)", () => {
  let inv: typeof import("@/lib/invitations");
  let db: typeof import("@/lib/db").db;
  let adminId: string;
  const suffix = Date.now();
  const emails: string[] = [];

  beforeAll(async () => {
    inv = await import("@/lib/invitations");
    db = (await import("@/lib/db")).db;
    const admin = await db.user.create({
      data: { email: `admin-${suffix}@test.local`, passwordHash: "x", role: "SUPER_ADMIN" },
    });
    adminId = admin.id;
  });

  afterAll(async () => {
    await db.auditLog.deleteMany({});
    await db.user.deleteMany({ where: { email: { in: emails } } });
    await db.organizerInvitation.deleteMany({ where: { email: { in: emails } } });
    await db.user.delete({ where: { id: adminId } }).catch(() => {});
    await db.$disconnect();
  });

  const newEmail = (n: string) => {
    const e = `${n}-${suffix}@test.local`;
    emails.push(e);
    return e;
  };

  it("stores only a hash and rejects duplicate pending invitations", async () => {
    const email = newEmail("dup");
    const { invitation, token } = await inv.createInvitation(adminId, email);
    expect(invitation.tokenHash).not.toBe(token);
    await expect(inv.createInvitation(adminId, email)).rejects.toThrow(/pending/i);
  });

  it("accepts once; a second accept with the same token fails", async () => {
    const { token } = await inv.createInvitation(adminId, newEmail("once"));
    const user = await inv.acceptInvitation(token, { name: "Org One", password: "a-long-password-1" });
    expect(user.role).toBe("ORGANIZER");
    await expect(inv.acceptInvitation(token, { name: "Again", password: "a-long-password-2" })).rejects.toThrow();
  });

  it("lets exactly one of two concurrent accepts win", async () => {
    const email = newEmail("race");
    const { token } = await inv.createInvitation(adminId, email);
    const results = await Promise.allSettled([
      inv.acceptInvitation(token, { name: "A", password: "a-long-password-1" }),
      inv.acceptInvitation(token, { name: "B", password: "a-long-password-2" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.user.count({ where: { email } })).toBe(1);
  });

  it("rejects expired and revoked invitations", async () => {
    const a = await inv.createInvitation(adminId, newEmail("exp"));
    await db.organizerInvitation.update({ where: { id: a.invitation.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(inv.acceptInvitation(a.token, { name: "E", password: "a-long-password-1" })).rejects.toThrow();

    const b = await inv.createInvitation(adminId, newEmail("rev"));
    await inv.revokeInvitation(adminId, b.invitation.id);
    await expect(inv.acceptInvitation(b.token, { name: "R", password: "a-long-password-1" })).rejects.toThrow();
  });

  it("resend invalidates the old link", async () => {
    const first = await inv.createInvitation(adminId, newEmail("resend"));
    const second = await inv.resendInvitation(adminId, first.invitation.id);
    await expect(inv.acceptInvitation(first.token, { name: "Old", password: "a-long-password-1" })).rejects.toThrow();
    const user = await inv.acceptInvitation(second.token, { name: "New", password: "a-long-password-1" });
    expect(user.email).toBe(first.invitation.email);
  });
});
