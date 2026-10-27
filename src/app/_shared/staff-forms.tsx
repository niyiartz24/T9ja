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
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="userId" value={userId} />
      <div className="flex gap-2">
        <Button size="sm" variant="outline" name="intent" value="reset" disabled={pending}>Reset password</Button>
        <Button size="sm" variant="ghost" name="intent" value="remove" disabled={pending}
          onClick={(e) => { if (!confirm("Remove this scanner from the event?")) e.preventDefault(); }}>Remove</Button>
      </div>
      <Result state={state} />
    </form>
  );
}
