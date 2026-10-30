"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reportTransfer } from "./claim-actions";

export function TransferClaim({ reference, defaultName }: { reference: string; defaultName: string }) {
  const [state, action, pending] = useActionState(reportTransfer, null);
  return (
    <form action={action} className="space-y-3 border-t pt-4">
      <input type="hidden" name="reference" value={reference} />
      <p className="font-medium">Done transferring?</p>
      <div className="space-y-2">
        <Label htmlFor="senderName">Name on the account you paid from</Label>
        <Input id="senderName" name="senderName" defaultValue={defaultName} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="note">Anything that helps us find it (optional)</Label>
        <Input id="note" name="note" placeholder="Bank used, time of transfer" />
      </div>
      {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>{pending ? "Sending..." : "I have made the transfer"}</Button>
    </form>
  );
}
