import { describe, expect, it } from "vitest";
import { minorToMajorInput, parseMajorToMinor } from "@/lib/money";
import { available, parseTicketTypeForm, salesWindowProblem } from "@/lib/ticket-types";
import { newOrderReference } from "@/lib/inventory";

describe("price parsing", () => {
  it("parses exact decimals without float drift", () => {
    expect(parseMajorToMinor("2500")).toBe(250000);
    expect(parseMajorToMinor("2500.5")).toBe(250050);
    expect(parseMajorToMinor("0.07")).toBe(7);
    expect(parseMajorToMinor("0")).toBe(0);
  });
  it("rejects malformed prices", () => {
    for (const bad of ["", "-1", "1e3", "1.234", "1,000", "abc", "1.", ".5"]) expect(parseMajorToMinor(bad)).toBeNull();
  });
  it("round-trips for editing", () => expect(minorToMajorInput(250050)).toBe("2500.50"));
});

const ok = { name: "Regular", price: "5000", quantityTotal: "100", isActive: "on" };

describe("parseTicketTypeForm", () => {
  it("accepts a valid type and converts price to kobo", () => {
    const r = parseTicketTypeForm(ok, "Africa/Lagos");
    expect(r.ok && r.data.priceMinor).toBe(500000);
  });
  it("rejects bad quantities and limits", () => {
    expect(parseTicketTypeForm({ ...ok, quantityTotal: "0" }, "UTC").ok).toBe(false);
    expect(parseTicketTypeForm({ ...ok, quantityTotal: "1.5" }, "UTC").ok).toBe(false);
    expect(parseTicketTypeForm({ ...ok, minPerOrder: "5", maxPerOrder: "2" }, "UTC").ok).toBe(false);
    expect(parseTicketTypeForm({ ...ok, quantityTotal: "3", minPerOrder: "4", maxPerOrder: "5" }, "UTC").ok).toBe(false);
    expect(parseTicketTypeForm({ ...ok, price: "free" }, "UTC").ok).toBe(false);
  });
  it("rejects sales closing before opening", () => {
    expect(parseTicketTypeForm({ ...ok, salesOpenAt: "2026-12-02T10:00", salesCloseAt: "2026-12-01T10:00" }, "UTC").ok).toBe(false);
  });
});

describe("salesWindowProblem", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  const event = { status: "PUBLISHED", endsAt: new Date("2026-12-01T00:00:00Z"), salesOpenAt: null, salesCloseAt: null };
  const open = { salesOpenAt: null, salesCloseAt: null };
  it("allows sales inside the window", () => expect(salesWindowProblem(event, open, now)).toBeNull());
  it("blocks unpublished, ended, not-yet-open and closed", () => {
    expect(salesWindowProblem({ ...event, status: "DRAFT" }, open, now)).toMatch(/not on sale/);
    expect(salesWindowProblem({ ...event, endsAt: new Date("2026-10-01") }, open, now)).toMatch(/ended/);
    expect(salesWindowProblem(event, { salesOpenAt: new Date("2026-11-02"), salesCloseAt: null }, now)).toMatch(/not opened/);
    expect(salesWindowProblem(event, { salesOpenAt: null, salesCloseAt: new Date("2026-11-01T12:00:00Z") }, now)).toMatch(/closed/);
  });
  it("applies the stricter of event and ticket windows", () => {
    const e = { ...event, salesCloseAt: new Date("2026-11-01T11:00:00Z") };
    expect(salesWindowProblem(e, { salesOpenAt: null, salesCloseAt: new Date("2026-11-30") }, now)).toMatch(/closed/);
  });
});

describe("misc", () => {
  it("computes availability, never negative", () => {
    expect(available({ quantityTotal: 10, quantitySold: 3, quantityReserved: 2 })).toBe(5);
    expect(available({ quantityTotal: 1, quantitySold: 1, quantityReserved: 1 })).toBe(0);
  });
  it("generates well-formed unique order references", () => {
    const refs = new Set(Array.from({ length: 500 }, newOrderReference));
    expect(refs.size).toBe(500);
    for (const r of refs) expect(r).toMatch(/^T9-[0-9A-Z]{10}$/);
  });
});
