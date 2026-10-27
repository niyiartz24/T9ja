"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { changeStatus } from "./actions";

export function StatusActions({ id, status }: { id: string; status: string }) {
  const [state, action, pending] = useActionState(changeStatus, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="id" value={id} />
      {status === "DRAFT" && <Button name="intent" value="publish" disabled={pending}>Publish</Button>}
      {status === "PUBLISHED" && <Button name="intent" value="unpublish" variant="outline" disabled={pending}>Unpublish</Button>}
      {(status === "DRAFT" || status === "PUBLISHED") && (
        <Button
          name="intent" value="cancel" variant="destructive" disabled={pending}
          onClick={(e) => { if (!confirm("Cancel this event? Orders and tickets are kept.")) e.preventDefault(); }}
        >
          Cancel event
        </Button>
      )}
      {state && <p role="status" className={state.ok ? "text-sm" : "text-sm text-destructive"}>{state.message}</p>}
    </form>
  );
}
