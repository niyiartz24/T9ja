"use client";
import { useActionState, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMinor } from "@/lib/money";
import { startCheckout } from "./actions";

export type PickerType = {
  id: string; name: string; description: string | null; priceMinor: number; currency: string;
  min: number; max: number; unavailable: string | null; lowStock: number | null;
};

export function TicketPicker({ eventId, types }: { eventId: string; types: PickerType[] }) {
  const [state, action, pending] = useActionState(startCheckout, null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const count = Object.values(qty).reduce((a, b) => a + b, 0);
  const total = types.reduce((s, t) => s + (qty[t.id] ?? 0) * t.priceMinor, 0); // display only; the server recomputes
  const currency = types[0]?.currency ?? "NGN";

  function step(t: PickerType, dir: 1 | -1) {
    const cur = qty[t.id] ?? 0;
    const next = dir === 1 ? (cur === 0 ? t.min : Math.min(cur + 1, t.max)) : cur <= t.min ? 0 : cur - 1;
    setQty({ ...qty, [t.id]: next });
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="eventId" value={eventId} />
      <ul className="divide-y rounded-lg border">
        {types.map((t) => (
          <li key={t.id} className="flex items-center gap-4 p-4">
            <div className="flex-1">
              <p className="font-medium">{t.name}</p>
              {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
              <p className="mt-1 text-sm">{formatMinor(t.priceMinor, t.currency)}</p>
              {t.lowStock && !t.unavailable && <p className="text-sm text-muted-foreground">Only {t.lowStock} left</p>}
            </div>
            {t.unavailable ? (
              <span className="text-sm text-muted-foreground">{t.unavailable}</span>
            ) : (
              <div className="flex items-center gap-2">
                <input type="hidden" name={`qty_${t.id}`} value={qty[t.id] ?? 0} />
                <Button type="button" size="icon" variant="outline" aria-label={`Remove one ${t.name}`} onClick={() => step(t, -1)} disabled={(qty[t.id] ?? 0) === 0}><Minus className="h-4 w-4" /></Button>
                <span className="w-6 text-center tabular-nums" aria-live="polite">{qty[t.id] ?? 0}</span>
                <Button type="button" size="icon" variant="outline" aria-label={`Add one ${t.name}`} onClick={() => step(t, 1)} disabled={(qty[t.id] ?? 0) >= t.max}><Plus className="h-4 w-4" /></Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="name">Full name</Label><Input id="name" name="name" autoComplete="name" required /></div>
        <div className="space-y-2"><Label htmlFor="email">Email (tickets are sent here)</Label><Input id="email" name="email" type="email" autoComplete="email" required /></div>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span>{count} {count === 1 ? "ticket" : "tickets"}</span>
        <span className="text-base font-semibold">{total === 0 && count > 0 ? "Free" : formatMinor(total, currency) === "Free" ? "" : formatMinor(total, currency)}</span>
      </div>
      {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={pending || count === 0}>
        {pending ? "Reserving..." : total === 0 ? "Get free tickets" : "Continue to payment"}
      </Button>
    </form>
  );
}
