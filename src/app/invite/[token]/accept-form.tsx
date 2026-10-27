"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { acceptInviteAction } from "./actions";

export function AcceptForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState(acceptInviteAction, null);
  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="token" value={token} />
      <p className="text-sm text-muted-foreground">Creating the account for {email}.</p>
      <div className="space-y-2"><Label htmlFor="name">Full name</Label><Input id="name" name="name" autoComplete="name" required /></div>
      <div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" autoComplete="new-password" minLength={12} required /></div>
      <div className="space-y-2"><Label htmlFor="confirm">Confirm password</Label><Input id="confirm" name="confirm" type="password" autoComplete="new-password" required /></div>
      {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>{pending ? "Creating account..." : "Accept invitation"}</Button>
    </form>
  );
}
