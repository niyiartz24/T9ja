import { describe, expect, it } from "vitest";
import { destinationAfterLogin, homeFor } from "@/lib/redirects";

describe("homeFor", () => {
  it("sends each role to its own area", () => {
    expect(homeFor("SUPER_ADMIN")).toBe("/admin");
    expect(homeFor("ORGANIZER")).toBe("/organizer");
    expect(homeFor("STAFF")).toBe("/scanner");
  });
});

describe("destinationAfterLogin", () => {
  it("returns to the scanner for every role that may use it, instead of the overview", () => {
    for (const role of ["STAFF", "ORGANIZER", "SUPER_ADMIN"] as const) expect(destinationAfterLogin("/scanner", role)).toBe("/scanner");
    expect(destinationAfterLogin("/scanner/abc123", "ORGANIZER")).toBe("/scanner/abc123");
  });
  it("falls back to the role's home when there is no usable destination", () => {
    expect(destinationAfterLogin(undefined, "ORGANIZER")).toBe("/organizer");
    expect(destinationAfterLogin("", "SUPER_ADMIN")).toBe("/admin");
    expect(destinationAfterLogin(null, "STAFF")).toBe("/scanner");
  });
  it("never sends someone to an area their role cannot use", () => {
    expect(destinationAfterLogin("/admin", "ORGANIZER")).toBe("/organizer");
    expect(destinationAfterLogin("/admin/payments", "STAFF")).toBe("/scanner");
    expect(destinationAfterLogin("/organizer/events", "SUPER_ADMIN")).toBe("/admin");
    expect(destinationAfterLogin("/admin/orders", "SUPER_ADMIN")).toBe("/admin/orders");
  });
  it("rejects other sites and look-alike paths", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "/scannerx", "/scanner:80", "javascript:alert(1)", "scanner", "/login", "/api/x"]) {
      expect(destinationAfterLogin(bad, "ORGANIZER")).toBe("/organizer");
    }
  });
});
