import { describe, expect, it } from "vitest";
import { maskEmail } from "@/lib/format";
import { newQrToken, newTicketCode } from "@/lib/tickets";

describe("ticket identifiers", () => {
  it("are well-formed and unique", () => {
    const codes = new Set(Array.from({ length: 1000 }, newTicketCode));
    const tokens = new Set(Array.from({ length: 1000 }, newQrToken));
    expect(codes.size).toBe(1000);
    expect(tokens.size).toBe(1000);
    for (const c of codes) expect(c).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });
});

describe("maskEmail", () => {
  it("masks emails", () => {
    expect(maskEmail("john.doe@gmail.com")).toBe("j*******@gmail.com");
    expect(maskEmail("a@b.co")).toBe("a***@b.co");
    expect(maskEmail("nonsense")).toBe("***");
  });
});
