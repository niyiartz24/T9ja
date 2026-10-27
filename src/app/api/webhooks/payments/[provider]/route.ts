import { NextResponse, after } from "next/server";
import { processOutbox } from "@/lib/outbox";
import { PaymentConfigError } from "@/lib/payments/registry";
import { WebhookAuthError, processWebhook } from "@/lib/payments/service";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const raw = await req.text(); // the signature is computed over the raw body, so read it untouched
  if (raw.length > 100_000) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  try {
    const result = await processWebhook(provider, raw, req.headers);
    after(() => processOutbox(5).catch((e) => console.error("outbox", e)));
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof WebhookAuthError) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    if (e instanceof PaymentConfigError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    console.error("webhook processing failed", e);
    return NextResponse.json({ error: "Processing error" }, { status: 500 }); // 5xx makes the gateway retry
  }
}
