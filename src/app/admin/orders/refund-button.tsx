"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { refund } from "./actions";

export function RefundButton({ paymentId }: { paymentId: string }) {
  const [state, action, pending] = useActionState(refund, null);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="paymentId" value={paymentId} />
      <Button
        size="sm" variant="outline" disabled={pending}
        onClick={(e) => { if (!confirm("Refund this payment? This cannot be undone.")) e.preventDefault(); }}
      >
        {pending ? "Refunding..." : "Refund"}
      </Button>
      {state && !state.ok && <span role="alert" className="text-xs text-destructive">{state.message}</span>}
    </form>
  );
}
