"use client";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { payNow } from "./actions";

export function PayButton({ reference, label }: { reference: string; label: string }) {
  const [state, action, pending] = useActionState(payNow, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="reference" value={reference} />
      <Button type="submit" className="w-full" disabled={pending}>{pending ? "Redirecting..." : label}</Button>
      {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}

/** Re-checks the order every few seconds while a payment is in flight, for at most two minutes. */
export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 5000);
    const stop = setTimeout(() => clearInterval(t), 120_000);
    return () => { clearInterval(t); clearTimeout(stop); };
  }, [router]);
  return null;
}
