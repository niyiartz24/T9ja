"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmPayment, rejectPayment } from "./actions";

export function PaymentActions({ paymentId, expectedAmount }: { paymentId: string; expectedAmount: string }) {
  const [confirmState, confirm, confirming] = useActionState(confirmPayment, null);
  const [rejectState, reject, rejecting] = useActionState(rejectPayment, null);
  const state = confirmState ?? rejectState;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <form action={confirm} className="flex items-center gap-2">
          <input type="hidden" name="paymentId" value={paymentId} />
          <Input name="amount" defaultValue={expectedAmount} inputMode="decimal" aria-label="Amount received in naira" className="h-8 w-28" />
          <Button size="sm" disabled={confirming || rejecting}
            onClick={(e) => { if (!window.confirm("Confirm that this money is in the Ticket9ja account? Tickets are issued and emailed immediately.")) e.preventDefault(); }}>
            {confirming ? "Confirming..." : "Confirm received"}
          </Button>
        </form>
        <form action={reject}>
          <input type="hidden" name="paymentId" value={paymentId} />
          <Button size="sm" variant="outline" disabled={confirming || rejecting}
            onClick={(e) => { if (!window.confirm("Mark this transfer as NOT received?")) e.preventDefault(); }}>
            {rejecting ? "..." : "Not received"}
          </Button>
        </form>
      </div>
      {state && <p role="status" className={state.ok ? "text-xs" : "text-xs text-destructive"}>{state.message}</p>}
    </div>
  );
}
