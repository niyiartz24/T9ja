import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <h1 className="text-4xl font-semibold tracking-tight">Ticket9ja</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Got an event link? Open it to choose your tickets. They are emailed to you as soon as your order is complete.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">Already bought tickets? Find your order with your reference and email.</p>
      <Button asChild className="mt-8"><Link href="/orders/lookup">Find my order</Link></Button>
    </main>
  );
}
