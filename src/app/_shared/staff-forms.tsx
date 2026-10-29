"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addStaff, staffAction, type StaffState } from "./staff-actions";

function Result({ state }: { state: StaffState }) {
  if (!state) return null;
  return (
    <div role="status" className={state.ok ? "rounded-md border p-3 text-sm" : "text-sm text-destructive"}>
      <p>{state.message}</p>
      {state.ok && state.password && (
        <p className="mt-2 font-mono text-sm">Email: {state.email}<br />Password: {state.password}</p>
      )}
    </div>
  );
}

export function AddStaffForm({ eventId }: { eventId: string }) {
  const [state, action, pending] = useActionState(addStaff, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="eventId" value={eventId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="staff-email">Scanner email</Label><Input id="staff-email" name="email" type="email" required /></div>
        <div className="space-y-2"><Label htmlFor="staff-name">Name (optional)</Label><Input id="staff-name" name="name" /></div>
      </div>
      <Button type="submit" disabled={pending}>{pending ? "Adding..." : "Add scanner"}</Button>
      <Result state={state} />
    </form>
  );
}

export function StaffControls({ eventId, userId }: { eventId: string; userId: string }) {
  const [state, action, pending] = useActionState(staffAction, null);
  const button = (intent: string, label: string, variant: "outline" | "ghost", confirmText?: string) => (
    <form action={action}>
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="intent" value={intent} />
      <Button
        type="submit" size="sm" variant={variant} disabled={pending}
        onClick={confirmText ? (e) => { if (!confirm(confirmText)) e.preventDefault(); } : undefined}
      >
        {label}
      </Button>
    </form>
  );
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {button("reset", "Reset password", "outline")}
        {button("remove", "Remove", "ghost", "Remove this scanner from the event?")}
      </div>
      <Result state={state} />
    </div>
  );
}
