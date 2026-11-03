"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addOrganizer, removeOrganizer } from "./organizer-actions";

export function AddOrganizerForm({ eventId, suggestions }: { eventId: string; suggestions: { email: string; name: string | null }[] }) {
  const [state, action, pending] = useActionState(addOrganizer, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="eventId" value={eventId} />
      <div className="space-y-2">
        <Label htmlFor="organizer-email">Add an organizer by email</Label>
        <Input id="organizer-email" name="email" type="email" list="organizer-suggestions" placeholder="organizer@example.com" required />
        {suggestions.length > 0 && (
          <datalist id="organizer-suggestions">
            {suggestions.map((s) => <option key={s.email} value={s.email}>{s.name ?? ""}</option>)}
          </datalist>
        )}
      </div>
      <Button type="submit" disabled={pending}>{pending ? "Adding..." : "Add organizer"}</Button>
      {state && <p role="status" className={state.ok ? "text-sm" : "text-sm text-destructive"}>{state.message}</p>}
    </form>
  );
}

export function RemoveOrganizerButton({ eventId, userId, label, confirmText }: { eventId: string; userId: string; label: string; confirmText: string }) {
  const [state, action, pending] = useActionState(removeOrganizer, null);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="userId" value={userId} />
      <Button type="submit" size="sm" variant="ghost" disabled={pending} onClick={(e) => { if (!confirm(confirmText)) e.preventDefault(); }}>{label}</Button>
      {state && !state.ok && <span role="alert" className="text-xs text-destructive">{state.message}</span>}
    </form>
  );
}
