"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lookupOrder } from "./actions";

export function LookupForm() {
  const [state, action, pending] = useActionState(lookupOrder, null);
  return (
    <form action={action} className="mt-6 space-y-4">
      <div className="space-y-2"><Label htmlFor="reference">Order reference</Label><Input id="reference" name="reference" placeholder="T9-XXXXXXXXXX" required /></div>
      <div className="space-y-2"><Label htmlFor="email">Email used at checkout</Label><Input id="email" name="email" type="email" required /></div>
      {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Searching..." : "Find order"}</Button>
    </form>
  );
}
