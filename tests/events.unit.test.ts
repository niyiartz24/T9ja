import { describe, expect, it } from "vitest";
import { parseEventForm, publishProblems, slugify, utcToZonedInput, zonedToUtc } from "@/lib/events";
import { sniffImage } from "@/lib/uploads";

describe("timezone conversion", () => {
  it("converts Lagos (UTC+1) wall time to UTC", () => {
    expect(zonedToUtc("2026-12-01T19:00", "Africa/Lagos")?.toISOString()).toBe("2026-12-01T18:00:00.000Z");
  });
  it("handles New York standard and daylight time", () => {
    expect(zonedToUtc("2026-12-01T19:00", "America/New_York")?.toISOString()).toBe("2026-12-02T00:00:00.000Z");
    expect(zonedToUtc("2026-07-01T09:00", "America/New_York")?.toISOString()).toBe("2026-07-01T13:00:00.000Z");
  });
  it("round-trips and rejects impossible or nonexistent times", () => {
    const d = zonedToUtc("2026-03-15T10:30", "Europe/London")!;
    expect(utcToZonedInput(d, "Europe/London")).toBe("2026-03-15T10:30");
    expect(zonedToUtc("2026-02-30T10:00", "UTC")).toBeNull();
    expect(zonedToUtc("2026-03-08T02:30", "America/New_York")).toBeNull(); // DST gap
    expect(zonedToUtc("garbage", "UTC")).toBeNull();
  });
});

describe("slugify", () => {
  it("normalizes titles", () => {
    expect(slugify("Lagos Jazz Night 2026!")).toBe("lagos-jazz-night-2026");
    expect(slugify("Café déjà vu")).toBe("cafe-deja-vu");
    expect(slugify("!!!")).toBe("event");
  });
});

const base = { title: "Jazz Night", timezone: "Africa/Lagos", startsAt: "2026-12-01T19:00", endsAt: "2026-12-01T23:00" };

describe("parseEventForm", () => {
  it("accepts a minimal draft", () => {
    const r = parseEventForm(base);
    expect(r.ok).toBe(true);
  });
  it("rejects end before start, bad timezone, and sales closing after the event", () => {
    expect(parseEventForm({ ...base, endsAt: "2026-12-01T18:00" }).ok).toBe(false);
    expect(parseEventForm({ ...base, timezone: "Mars/Olympus" }).ok).toBe(false);
    expect(parseEventForm({ ...base, salesCloseAt: "2026-12-02T00:00" }).ok).toBe(false);
  });
  it("rejects non-https links and foreign cover paths", () => {
    expect(parseEventForm({ ...base, onlineUrl: "http://x.com" }).ok).toBe(false);
    expect(parseEventForm({ ...base, onlineUrl: "javascript:alert(1)" }).ok).toBe(false);
    expect(parseEventForm({ ...base, coverImage: "https://evil.example/x.png" }).ok).toBe(false);
  });
});

describe("publishProblems", () => {
  const ok = {
    title: "T", description: "x".repeat(40), venueName: "Hall", venueAddress: "1 Road",
    isOnline: false, onlineUrl: null, endsAt: new Date("2030-01-01"),
  };
  const now = new Date("2026-10-10");
  it("passes a complete event", () => expect(publishProblems(ok, 1, now)).toEqual([]));
  it("lists every missing requirement", () => {
    const p = publishProblems({ ...ok, description: "short", venueName: null, endsAt: new Date("2026-01-01") }, 0, now);
    expect(p).toHaveLength(4);
  });
  it("requires a link for online events instead of a venue", () => {
    expect(publishProblems({ ...ok, isOnline: true, venueName: null, venueAddress: null }, 1, now)).toHaveLength(1);
    expect(publishProblems({ ...ok, isOnline: true, onlineUrl: "https://x.co", venueName: null, venueAddress: null }, 1, now)).toEqual([]);
  });
});

describe("sniffImage", () => {
  const pad = (a: number[]) => new Uint8Array([...a, ...new Array(16).fill(0)]);
  it("detects real images by content", () => {
    expect(sniffImage(pad([0x89, 0x50, 0x4e, 0x47]))?.ext).toBe("png");
    expect(sniffImage(pad([0xff, 0xd8, 0xff]))?.ext).toBe("jpg");
  });
  it("rejects scripts and SVG regardless of name", () => {
    expect(sniffImage(new TextEncoder().encode("<svg onload=alert(1)></svg>   "))).toBeNull();
    expect(sniffImage(new TextEncoder().encode("<script>alert(1)</script>"))).toBeNull();
  });
});
