// Appends the partial unique index (one PENDING invitation per email) to the init migration.
// Prisma cannot express partial indexes in schema.prisma, so it lives in the migration SQL.
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";

const dir = "prisma/migrations";
if (!existsSync(dir)) {
  console.error("No prisma/migrations folder found. Run: npm run db:init");
  process.exit(1);
}
const latest = readdirSync(dir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort()
  .at(-1);
const file = `${dir}/${latest}/migration.sql`;
if (readFileSync(file, "utf8").includes("one_pending_per_email")) {
  console.log("Partial index already present, nothing to do.");
  process.exit(0);
}
appendFileSync(file, "\n-- Only one PENDING invitation per email\n" + readFileSync("prisma/sql/one_pending_invitation.sql", "utf8"));
console.log(`Added partial index to ${file}`);
