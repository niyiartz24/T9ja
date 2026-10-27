import "server-only";
import { headers } from "next/headers";
import { consume } from "@/lib/rate-limit-core";

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

/** Per-IP limiter for server actions. Fails open if the limiter itself errors, so an outage never blocks sales. */
export async function allow(bucket: string, limit: number, windowSec: number): Promise<boolean> {
  try {
    return await consume(`${bucket}:${await clientIp()}`.slice(0, 200), limit, windowSec);
  } catch (e) {
    console.error("rate limiter error", e);
    return true;
  }
}
