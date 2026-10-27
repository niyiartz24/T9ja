// One-time Super Admin bootstrap. Reads credentials from the environment, never hardcoded.
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

const db = new PrismaClient();

async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD.");
  if (password.length < 12) throw new Error("Bootstrap password must be at least 12 characters.");
  if (await db.user.findFirst({ where: { role: "SUPER_ADMIN" } })) {
    console.log("A Super Admin already exists. Nothing done.");
    return;
  }
  const user = await db.user.create({
    data: { email, passwordHash: await hash(password), role: "SUPER_ADMIN", emailVerified: new Date(), name: "Super Admin" },
  });
  await db.auditLog.create({ data: { actorId: user.id, action: "admin.bootstrap", entityType: "User", entityId: user.id } });
  console.log(`Super Admin created: ${email}. Now remove the bootstrap variables.`);
}

main().finally(() => db.$disconnect());
