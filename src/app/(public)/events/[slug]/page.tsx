/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin, Wifi } from "lucide-react";
import { db } from "@/lib/db";
import { formatInTz } from "@/lib/events";
import { available, salesWindowProblem } from "@/lib/ticket-types";
import { TicketPicker, type PickerType } from "./ticket-picker";

const load = (slug: string) =>
  db.event.findUnique({ where: { slug }, include: { ticketTypes: { where: { isActive: true }, orderBy: { priceMinor: "asc" } } } });

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const event = await load((await params).slug);
  if (!event || event.status === "DRAFT") return { title: "Event not found" };
  return { title: `${event.title} | Ticket9ja`, description: event.description.slice(0, 160), robots: { index: false, follow: false } };
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const event = await load((await params).slug);
  if (!event || event.status === "DRAFT") notFound();
  const now = new Date();
  const cancelled = event.status === "CANCELLED";
  const ended = event.endsAt <= now || event.status === "COMPLETED";
  const canBuy = event.status === "PUBLISHED" && !ended;

  const types: PickerType[] = event.ticketTypes.map((t) => {
    const left = available(t);
    const problem = salesWindowProblem(event, t, now);
    return {
      id: t.id, name: t.name, description: t.description, priceMinor: t.priceMinor, currency: t.currency,
      min: t.minPerOrder, max: Math.min(t.maxPerOrder, left),
      unavailable: problem ? problem.replace("Ticket sales have not opened yet.", "Sales not open yet").replace("Ticket sales have closed.", "Sales closed") : left < t.minPerOrder ? "Sold out" : null,
      lowStock: left > 0 && left <= 10 ? left : null,
    };
  });

  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-6 py-10 lg:grid-cols-[1fr_380px]">
      <article className="space-y-6">
        {event.coverImage && <img src={event.coverImage} alt="" className="h-64 w-full rounded-lg object-cover sm:h-80" />}
        <h1 className="text-3xl font-semibold tracking-tight">{event.title}</h1>
        {cancelled && <p role="status" className="rounded-md border border-destructive p-3 text-sm">This event has been cancelled.</p>}
        {!cancelled && ended && <p role="status" className="rounded-md border p-3 text-sm">This event has ended.</p>}
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-center gap-2"><CalendarDays className="h-4 w-4" aria-hidden />{formatInTz(event.startsAt, event.timezone)} to {formatInTz(event.endsAt, event.timezone)} ({event.timezone})</li>
          <li className="flex items-center gap-2">
            {event.isOnline ? <Wifi className="h-4 w-4" aria-hidden /> : <MapPin className="h-4 w-4" aria-hidden />}
            {event.isOnline ? "Online event. Access details are sent with your ticket." : [event.venueName, event.venueAddress].filter(Boolean).join(", ")}
          </li>
        </ul>
        <p className="whitespace-pre-line leading-relaxed">{event.description}</p>
      </article>
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <h2 className="mb-4 text-lg font-semibold">Tickets</h2>
        {!canBuy ? (
          <p className="text-sm text-muted-foreground">Tickets are no longer available for this event.</p>
        ) : types.length === 0 ? (
          <p className="text-sm text-muted-foreground">Tickets are not available yet.</p>
        ) : (
          <TicketPicker eventId={event.id} types={types} />
        )}
      </aside>
    </main>
  );
}
