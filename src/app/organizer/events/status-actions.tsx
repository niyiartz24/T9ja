"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { changeStatus } from "./actions";

export function StatusActions({ id, status }: { id: string; status: string }) {
  const [state, action, pending] = useActionState(changeStatus, null);

  // One small form per button, each carrying its own hidden "intent". This does not depend on the
  // browser reporting which submit button was pressed, which is not reliable with form actions.
  const button = (intent: string, label: string, variant: "default" | "outline" | "destructive", confirmText?: string) => (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="intent" value={intent} />
      <Button
        type="submit" variant={variant} disabled={pending}
        onClick={confirmText ? (e) => { if (!confirm(confirmText)) e.preventDefault(); } : undefined}
      >
        {label}
      </Button>
    </form>
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        {status === "DRAFT" && button("publish", "Publish", "default")}
        {status === "PUBLISHED" && button("unpublish", "Unpublish", "outline")}
        {(status === "DRAFT" || status === "PUBLISHED") && button("cancel", "Cancel event", "destructive", "Cancel this event? Orders and tickets are kept.")}
      </div>
      {state && <p role="status" className={state.ok ? "text-sm" : "text-sm text-destructive"}>{state.message}</p>}
    </div>
  );
}
