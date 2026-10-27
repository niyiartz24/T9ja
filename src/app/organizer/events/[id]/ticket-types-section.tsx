import type { TicketType } from "@prisma/client";
import { available } from "@/lib/ticket-types";
import { utcToZonedInput } from "@/lib/events";
import { formatMinor, minorToMajorInput } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { TicketTypeControls, TicketTypeForm } from "./ticket-type-form";

export function TicketTypesSection({ eventId, timezone, types, editable }: { eventId: string; timezone: string; types: TicketType[]; editable: boolean }) {
  const z = (d: Date | null) => (d ? utcToZonedInput(d, timezone) : "");
  const sorted = [...types].sort((a, b) => a.priceMinor - b.priceMinor || a.name.localeCompare(b.name));
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Ticket types</h2>
      {sorted.length === 0 && <p className="text-sm text-muted-foreground">No ticket types yet. Add one to be able to publish.</p>}
      <ul className="space-y-3">
        {sorted.map((t) => (
          <li key={t.id} className="rounded-md border p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-medium">{t.name}</span>
              <Badge variant={t.isActive ? "default" : "secondary"}>{t.isActive ? "Active" : "Inactive"}</Badge>
              <span className="text-sm">{formatMinor(t.priceMinor, t.currency)}</span>
              <span className="ml-auto text-sm text-muted-foreground">
                {t.quantitySold} sold, {t.quantityReserved} reserved, {available(t)} left of {t.quantityTotal}
              </span>
            </div>
            {editable && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm">Edit</summary>
                <div className="mt-4 space-y-4">
                  <TicketTypeForm
                    eventId={eventId}
                    values={{
                      id: t.id, name: t.name, description: t.description ?? "", price: minorToMajorInput(t.priceMinor),
                      quantityTotal: String(t.quantityTotal), minPerOrder: String(t.minPerOrder), maxPerOrder: String(t.maxPerOrder),
                      salesOpenAt: z(t.salesOpenAt), salesCloseAt: z(t.salesCloseAt), isActive: t.isActive,
                    }}
                  />
                  <TicketTypeControls eventId={eventId} id={t.id} active={t.isActive} locked={t.quantitySold + t.quantityReserved > 0} />
                </div>
              </details>
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <details className="rounded-md border p-4">
          <summary className="cursor-pointer text-sm font-medium">Add ticket type</summary>
          <div className="mt-4">
            <TicketTypeForm
              eventId={eventId}
              values={{ name: "", description: "", price: "", quantityTotal: "", minPerOrder: "1", maxPerOrder: "10", salesOpenAt: "", salesCloseAt: "", isActive: true }}
            />
          </div>
        </details>
      )}
    </section>
  );
}
