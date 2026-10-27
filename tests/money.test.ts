import { describe, expect, it } from "vitest";
import { formatMinor, toMinor } from "@/lib/money";

describe("money", () => {
  it("converts to integer minor units without float drift", () => {
    expect(toMinor(19.99)).toBe(1999);
    expect(toMinor(0.1 + 0.2)).toBe(30);
  });
  it("labels zero as Free", () => {
    expect(formatMinor(0)).toBe("Free");
  });
  it("rejects non-integer amounts", () => {
    expect(() => formatMinor(10.5)).toThrow();
  });
});
