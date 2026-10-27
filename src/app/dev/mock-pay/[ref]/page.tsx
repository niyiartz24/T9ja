import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatMinor } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { completeMock } from "./actions";

export default async function MockPayPage({ params }: { params: Promise<{ ref: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { ref } = await params;
  const payment = await db.payment.findUnique({
    where: { provider_providerReference: { provider: "mock", providerReference: ref } },
    include: { order: { include: { event: { select: { title: true } } } } },
  });
  if (!payment) notFound();
  return (
    <main className="mx-auto max-w-md space-y-6 px-6 py-16">
      <p className="rounded-md border p-3 text-sm">Development only. This simulates a payment gateway and does not exist in production.</p>
      <h1 className="text-2xl font-semibold">Mock payment</h1>
      <p className="text-sm text-muted-foreground">{payment.order.event.title}: {formatMinor(payment.amountMinor, payment.currency)}</p>
      <form action={completeMock} className="flex gap-3">
        <input type="hidden" name="ref" value={ref} />
        <Button name="outcome" value="success">Pay</Button>
        <Button name="outcome" value="failed" variant="outline">Decline</Button>
      </form>
    </main>
  );
}
