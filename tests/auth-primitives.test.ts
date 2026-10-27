import { describe, expect, it } from "vitest";
import { generateToken, hashToken } from "@/lib/tokens";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("tokens", () => {
  it("generates unique high-entropy tokens", () => {
    const a = generateToken();
    expect(a).not.toBe(generateToken());
    expect(a.length).toBeGreaterThanOrEqual(43);
  });
  it("hashes deterministically and never returns the raw token", () => {
    const t = generateToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toContain(t);
  });
});

describe("password", () => {
  it("verifies correct and rejects wrong or malformed hashes", async () => {
    const h = await hashPassword("correct horse battery");
    expect(await verifyPassword(h, "correct horse battery")).toBe(true);
    expect(await verifyPassword(h, "wrong")).toBe(false);
    expect(await verifyPassword("not-a-hash", "x")).toBe(false);
  });
});
