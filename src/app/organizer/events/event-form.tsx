"use client";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TIMEZONES } from "@/lib/events";
import { saveEvent } from "./actions";

export type EventFormValues = {
  id?: string; title: string; description: string; venueName: string; venueAddress: string;
  isOnline: boolean; onlineUrl: string; timezone: string; startsAt: string; endsAt: string;
  salesOpenAt: string; salesCloseAt: string; coverImage: string;
};

/** Resize and re-encode before upload: phone photos become ~150 KB WebP files, so pages load fast. */
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

type Owner = { id: string; label: string };

export function EventForm({ values, owners, ownerDefault }: { values: EventFormValues; owners?: Owner[]; ownerDefault?: string }) {
  const [state, action, pending] = useActionState(saveEvent, null);
  const [online, setOnline] = useState(values.isOnline);
  const [cover, setCover] = useState(values.coverImage);
  const [uploadError, setUploadError] = useState("");

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError("");
    const body = new FormData();
    body.set("file", await shrink(file), "cover.webp");
    const res = await fetch("/api/uploads/cover", { method: "POST", body });
    const json = await res.json();
    if (res.ok) setCover(json.url);
    else setUploadError(json.error ?? "Upload failed");
  }

  return (
    <form action={action} className="space-y-6">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <input type="hidden" name="coverImage" value={cover} />
      {owners && !values.id && (
        <div className="space-y-2">
          <Label htmlFor="ownerId">Organizer who owns this event</Label>
          <select id="ownerId" name="ownerId" defaultValue={ownerDefault} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
            {owners.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
      )}
      <div className="space-y-2"><Label htmlFor="title">Title</Label><Input id="title" name="title" defaultValue={values.title} required /></div>
      <div className="space-y-2"><Label htmlFor="description">Description</Label><Textarea id="description" name="description" rows={6} defaultValue={values.description} /></div>
      <div className="space-y-2">
        <Label htmlFor="cover">Cover image (PNG, JPEG or WebP, up to 2 MB)</Label>
        <Input id="cover" type="file" accept="image/png,image/jpeg,image/webp" onChange={onFile} />
        {cover && <img src={cover} alt="Cover preview" className="mt-2 h-32 rounded-md object-cover" />}
        {uploadError && <p role="alert" className="text-sm text-destructive">{uploadError}</p>}
      </div>
      <div className="flex items-center gap-2">
        <input id="isOnline" name="isOnline" type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} />
        <Label htmlFor="isOnline">This is an online event</Label>
      </div>
      {online ? (
        <div className="space-y-2"><Label htmlFor="onlineUrl">Event link (https)</Label><Input id="onlineUrl" name="onlineUrl" type="url" defaultValue={values.onlineUrl} /></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="venueName">Venue name</Label><Input id="venueName" name="venueName" defaultValue={values.venueName} /></div>
          <div className="space-y-2"><Label htmlFor="venueAddress">Venue address</Label><Input id="venueAddress" name="venueAddress" defaultValue={values.venueAddress} /></div>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="timezone">Event timezone (all times below use it)</Label>
        <select id="timezone" name="timezone" defaultValue={values.timezone} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
          {TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="startsAt">Starts</Label><Input id="startsAt" name="startsAt" type="datetime-local" defaultValue={values.startsAt} required /></div>
        <div className="space-y-2"><Label htmlFor="endsAt">Ends</Label><Input id="endsAt" name="endsAt" type="datetime-local" defaultValue={values.endsAt} required /></div>
        <div className="space-y-2"><Label htmlFor="salesOpenAt">Ticket sales open (optional)</Label><Input id="salesOpenAt" name="salesOpenAt" type="datetime-local" defaultValue={values.salesOpenAt} /></div>
        <div className="space-y-2"><Label htmlFor="salesCloseAt">Ticket sales close (optional)</Label><Input id="salesCloseAt" name="salesCloseAt" type="datetime-local" defaultValue={values.salesCloseAt} /></div>
      </div>
      {state && <p role="status" className={state.ok ? "text-sm" : "text-sm text-destructive"}>{state.message}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Saving..." : values.id ? "Save changes" : "Save draft"}</Button>
    </form>
  );
}
