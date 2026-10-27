import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { MAX_COVER_BYTES, sniffImage } from "@/lib/uploads";
import { saveCover } from "@/lib/storage";
import { consume } from "@/lib/rate-limit-core";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ORGANIZER" && user.role !== "SUPER_ADMIN")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await consume(`upload:${user.id}`, 30, 600).catch(() => true))) {
    return NextResponse.json({ error: "Too many uploads. Try again in a few minutes." }, { status: 429 });
  }
  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.size > MAX_COVER_BYTES) return NextResponse.json({ error: "Image must be 2 MB or smaller" }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) return NextResponse.json({ error: "Use a PNG, JPEG or WebP image" }, { status: 415 });
  try {
    return NextResponse.json({ url: await saveCover(bytes, kind.ext) });
  } catch (e) {
    console.error("cover upload failed", e);
    return NextResponse.json({ error: "Image storage is unavailable right now" }, { status: 503 });
  }
}
