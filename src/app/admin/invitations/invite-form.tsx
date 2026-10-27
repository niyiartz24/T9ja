"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inviteOrganizer } from "./actions";

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteOrganizer, null);
  return (
    <form action={action} className="flex items-end gap-3">
      <div className="flex-1 space-y-2">
        <Label htmlFor="email">Organizer email</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <Button type="submit" disabled={pending}>{pending ? "Sending..." : "Send invitation"}</Button>
      {state && (
        <p role="status" className={state.ok ? "text-sm" : "text-sm text-destructive"}>{state.message}</p>
      )}
    </form>
  );
}
