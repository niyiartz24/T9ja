"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { resendTickets } from "./actions";

export function ResendButton({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState(resendTickets, null);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="orderId" value={orderId} />
      <Button size="sm" variant="ghost" disabled={pending}>{pending ? "Queuing..." : "Resend tickets"}</Button>
      {state && <span role="status" className={state.ok ? "text-xs" : "text-xs text-destructive"}>{state.message}</span>}
    </form>
  );
}
