import QRCode from "qrcode";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** The QR encodes ONLY the opaque ticket token. We refuse to draw codes for tokens that are not real tickets. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return new Response("Not found", { status: 404 });
  const ticket = await db.ticket.findUnique({ where: { qrToken: token }, select: { id: true } });
  if (!ticket) return new Response("Not found", { status: 404 });
  const png = await QRCode.toBuffer(token, { type: "png", width: 360, margin: 2, errorCorrectionLevel: "M" });
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=86400" } });
}
