import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { expireStaleOrders } from "@/lib/inventory";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const digest = (s: string) => createHash("sha256").update(s).digest();
  if (!timingSafeEqual(digest(req.headers.get("authorization") ?? ""), digest(`Bearer ${secret}`))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ released: await expireStaleOrders() });
}
