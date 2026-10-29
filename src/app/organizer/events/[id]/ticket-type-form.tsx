"use client";
import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveTicketType, ticketTypeAction } from "./ticket-type-actions";

export type TicketTypeValues = {
  id?: string; name: string; description: string; price: string; quantityTotal: string;
  minPerOrder: string; maxPerOrder: string; salesOpenAt: string; salesCloseAt: string; isActive: boolean;
};

export function TicketTypeForm({ eventId, values }: { eventId: string; values: TicketTypeValues }) {
  const [state, action, pending] = useActionState(saveTicketType, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok && !values.id) ref.current?.reset(); }, [state, values.id]);
  const f = (name: string) => `${values.id ?? "new"}-${name}`;
  return (
    <form ref={ref} action={action} className="space-y-4">
      <input type="hidden" name="eventId" value={eventId} />
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor={f("name")}>Name</Label><Input id={f("name")} name="name" defaultValue={values.name} required /></div>
        <div className="space-y-2"><Label htmlFor={f("price")}>Price (NGN, 0 for free)</Label><Input id={f("price")} name="price" inputMode="decimal" defaultValue={values.price} required /></div>
        <div className="space-y-2"><Label htmlFor={f("qty")}>Total quantity</Label><Input id={f("qty")} name="quantityTotal" inputMode="numeric" defaultValue={values.quantityTotal} required /></div>
        <div className="space-y-2"><Label htmlFor={f("desc")}>Description (optional)</Label><Input id={f("desc")} name="description" defaultValue={values.description} /></div>
        <div className="space-y-2"><Label htmlFor={f("min")}>Minimum per order</Label><Input id={f("min")} name="minPerOrder" inputMode="numeric" defaultValue={values.minPerOrder} /></div>
        <div className="space-y-2"><Label htmlFor={f("max")}>Maximum per order</Label><Input id={f("max")} name="maxPerOrder" inputMode="numeric" defaultValue={values.maxPerOrder} /></div>
        <div className="space-y-2"><Label htmlFor={f("open")}>Sales open (optional)</Label><Input id={f("open")} name="salesOpenAt" type="datetime-local" defaultValue={values.salesOpenAt} /></div>
        <div className="space-y-2"><Label htmlFor={f("close")}>Sales close (optional)</Label><Input id={f("close")} name="salesCloseAt" type="datetime-local" defaultValue={values.salesCloseAt} /></div>
      </div>
      <div className="flex items-center gap-2">
        <input id={f("active")} name="isActive" type="checkbox" defaultChecked={values.isActive} />
        <Label htmlFor={f("active")}>Active (on sale)</Label>
      </div>
      {state && <p role="status" className={state.ok ? "text-sm" : "text-sm text-destructive"}>{state.message}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Saving..." : values.id ? "Save ticket type" : "Add ticket type"}</Button>
    </form>
  );
}

export function TicketTypeControls({ eventId, id, active, locked }: { eventId: string; id: string; active: boolean; locked: boolean }) {
  const [state, action, pending] = useActionState(ticketTypeAction, null);
  const button = (intent: string, label: string, variant: "outline" | "ghost", confirmText?: string) => (
    <form action={action}>
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="id" value={id} />
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
    <div className="flex flex-wrap items-center gap-2">
      {button(active ? "deactivate" : "activate", active ? "Deactivate" : "Activate", "outline")}
      {!locked && button("delete", "Delete", "ghost", "Delete this ticket type?")}
      {state && !state.ok && <span role="alert" className="text-sm text-destructive">{state.message}</span>}
    </div>
  );
}
