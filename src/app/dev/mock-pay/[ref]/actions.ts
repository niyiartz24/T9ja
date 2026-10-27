"use server";
import { randomBytes } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { processOutbox } from "@/lib/outbox";
import { z } from "zod";
import { db } from "@/lib/db";
import { signMock } from "@/lib/payments/mock";
import { processWebhook } from "@/lib/payments/service";

/** Simulates the gateway: records the outcome in its own ledger, then sends a signed webhook to us. */
export async function completeMock(form: FormData) {
  if (process.env.NODE_ENV === "production") notFound();
  const ref = z.string().min(5).max(80).parse(form.get("ref"));
  const outcome = z.enum(["success", "failed"]).parse(form.get("outcome"));
  const payment = await db.payment.findUnique({
    where: { provider_providerReference: { provider: "mock", providerReference: ref } },
    include: { order: { select: { reference: true } } },
  });
  if (!payment) notFound();
  const value = { status: outcome, amountMinor: payment.amountMinor, currency: payment.currency };
  await db.platformSetting.upsert({ where: { key: `mockgw:${ref}` }, create: { key: `mockgw:${ref}`, value }, update: { value } });
  const body = JSON.stringify({ id: `evt_${randomBytes(8).toString("hex")}`, type: outcome === "success" ? "charge.success" : "charge.failed", reference: ref });
  await processWebhook("mock", body, new Headers({ "x-mock-signature": signMock(body) }));
  after(() => processOutbox(5).catch((e) => console.error("outbox", e)));
  redirect(`/orders/${payment.order.reference}`);
}
