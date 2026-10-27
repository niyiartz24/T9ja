import { db } from "@/lib/db";

/** Atomic fixed-window counter. Returns true while the caller is within the limit. */
export async function consume(key: string, limit: number, windowSec: number): Promise<boolean> {
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "windowStart")
    VALUES (${key}, 1, (NOW() AT TIME ZONE 'UTC'))
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."windowStart" < (NOW() AT TIME ZONE 'UTC') - make_interval(secs => ${windowSec}::double precision)
                     THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimitBucket"."windowStart" < (NOW() AT TIME ZONE 'UTC') - make_interval(secs => ${windowSec}::double precision)
                           THEN (NOW() AT TIME ZONE 'UTC') ELSE "RateLimitBucket"."windowStart" END
    RETURNING "count"`;
  return rows[0].count <= limit;
}
