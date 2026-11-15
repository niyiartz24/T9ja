"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { resend, revoke } from "./actions";

export function InvitationButtons({ id, canResend, canRevoke }: { id: string; canResend: boolean; canRevoke: boolean }) {
  const [resent, resendAction, resending] = useActionState(resend, null);
  const [revoked, revokeAction, revoking] = useActionState(revoke, null);
  const state = resent ?? revoked;
  return (
    <div className="space-y-1">
      <div className="flex justify-end gap-2">
        {canResend && (
          <form action={resendAction}>
            <input type="hidden" name="id" value={id} />
            <Button size="sm" variant="outline" disabled={resending || revoking}>{resending ? "Sending..." : "Resend"}</Button>
          </form>
        )}
        {canRevoke && (
          <form action={revokeAction}>
            <input type="hidden" name="id" value={id} />
            <Button size="sm" variant="ghost" disabled={resending || revoking}>{revoking ? "..." : "Revoke"}</Button>
          </form>
        )}
      </div>
      {state && <p role="status" className={state.ok ? "text-right text-xs" : "text-right text-xs text-destructive"}>{state.message}</p>}
    </div>
  );
}
