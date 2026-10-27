import { EventForm } from "../event-form";

export default function NewEventPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <h1 className="text-2xl font-semibold">Create event</h1>
      <EventForm
        values={{
          title: "", description: "", venueName: "", venueAddress: "", isOnline: false, onlineUrl: "",
          timezone: "Africa/Lagos", startsAt: "", endsAt: "", salesOpenAt: "", salesCloseAt: "", coverImage: "",
        }}
      />
    </main>
  );
}
