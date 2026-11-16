import type { Role } from "@prisma/client";

export function homeFor(role: Role) {
  return role === "SUPER_ADMIN" ? "/admin" : role === "ORGANIZER" ? "/organizer" : "/scanner";
}

// Where a person may be sent back to after signing in. Only these areas, and only for roles that may use them.
const AREAS: Record<string, Role[]> = {
  "/scanner": ["STAFF", "ORGANIZER", "SUPER_ADMIN"],
  "/admin": ["SUPER_ADMIN"],
  "/organizer": ["ORGANIZER"],
};

/**
 * After login, return to the page that asked for it (for example the scanner) instead of always landing on the
 * dashboard overview. Anything that is not a plain path inside a known area is ignored, so this cannot be used
 * to send people to another site.
 */
export function destinationAfterLogin(next: string | null | undefined, role: Role): string {
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") && !next.includes(":")) {
    const area = Object.keys(AREAS).find((a) => next === a || next.startsWith(`${a}/`));
    if (area && AREAS[area].includes(role)) return next;
  }
  return homeFor(role);
}
