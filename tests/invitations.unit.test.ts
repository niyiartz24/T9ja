import { describe, expect, it } from "vitest";
import { inviteState } from "@/lib/invitations";

const now = new Date("2026-10-10T00:00:00Z");
const future = new Date("2026-10-11T00:00:00Z");
const past = new Date("2026-10-09T00:00:00Z");

describe("inviteState", () => {
  it("is PENDING before expiry and EXPIRED after", () => {
    expect(inviteState({ status: "PENDING", expiresAt: future }, now)).toBe("PENDING");
    expect(inviteState({ status: "PENDING", expiresAt: past }, now)).toBe("EXPIRED");
  });
  it("treats expiry boundary as expired", () => {
    expect(inviteState({ status: "PENDING", expiresAt: now }, now)).toBe("EXPIRED");
  });
  it("never revives finished invitations", () => {
    expect(inviteState({ status: "ACCEPTED", expiresAt: future }, now)).toBe("ACCEPTED");
    expect(inviteState({ status: "REVOKED", expiresAt: future }, now)).toBe("REVOKED");
  });
});
