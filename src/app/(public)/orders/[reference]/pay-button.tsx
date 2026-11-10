"use client";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { payNow } from "./actions";

export function PayButton({ reference, label, provider, fresh, description, variant }: { reference: string; label: string; provider?: string; fresh?: boolean; description?: string; variant?: "default" | "outline" }) {
  const [state, action, pending] = useActionState(payNow, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="reference" value={reference} />
      {provider && <input type="hidden" name="provider" value={provider} />}
      {fresh && <input type="hidden" name="fresh" value="1" />}
      <Button type="submit" variant={variant} className="w-full" disabled={pending}>{pending ? "Please wait..." : label}</Button>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
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
