import { afterEach, describe, expect, it, vi } from "vitest";
import { mockProvider, signMock } from "@/lib/payments/mock";
import { PaymentConfigError, getProvider } from "@/lib/payments/registry";
import { isValidCoverUrl } from "@/lib/events";

afterEach(() => vi.unstubAllEnvs());

describe("webhook signature", () => {
  const body = JSON.stringify({ id: "evt_1", type: "charge.success", reference: "P9-abc" });
  const headers = (sig: string) => new Headers({ "x-mock-signature": sig });
  it("accepts a correct signature", () => expect(mockProvider.validateWebhook(body, headers(signMock(body)))).toBe(true));
  it("rejects a tampered body, a wrong signature and a missing header", () => {
    expect(mockProvider.validateWebhook(body.replace("P9-abc", "P9-xyz"), headers(signMock(body)))).toBe(false);
    expect(mockProvider.validateWebhook(body, headers("0".repeat(64)))).toBe(false);
    expect(mockProvider.validateWebhook(body, headers("short"))).toBe(false);
    expect(mockProvider.validateWebhook(body, new Headers())).toBe(false);
  });
  it("uses the configured secret", () => {
    const before = signMock(body);
    vi.stubEnv("PAYMENT_WEBHOOK_SECRET", "another-secret-value");
    expect(signMock(body)).not.toBe(before);
  });
});

describe("parseWebhook", () => {
  it("maps events and rejects garbage", () => {
    expect(mockProvider.parseWebhook('{"id":"e1","type":"charge.success","reference":"R"}')).toEqual({ eventId: "e1", type: "payment.succeeded", reference: "R" });
    expect(mockProvider.parseWebhook('{"id":"e2","type":"charge.failed","reference":"R"}')?.type).toBe("payment.failed");
    expect(mockProvider.parseWebhook('{"id":"e3","type":"refund"}')?.type).toBe("other");
    expect(mockProvider.parseWebhook("not json")).toBeNull();
    expect(mockProvider.parseWebhook('{"type":"charge.success"}')).toBeNull();
  });
});

describe("provider registry", () => {
  it("fails closed when nothing is configured", () => {
    vi.stubEnv("PAYMENT_PROVIDER", "");
    expect(() => getProvider()).toThrow(PaymentConfigError);
  });
  it("never allows the mock provider in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYMENT_PROVIDER", "mock");
    expect(() => getProvider()).toThrow(/production/);
    expect(() => getProvider("mock")).toThrow(/production/);
  });
  it("rejects unknown providers and allows mock outside production", () => {
    expect(() => getProvider("nope")).toThrow(/Unknown/);
    expect(getProvider("mock").name).toBe("mock");
  });
});

describe("cover image URLs", () => {
  const file = "a".repeat(32) + ".webp";
  it("accepts the local dev path and the configured storage URL only", () => {
    expect(isValidCoverUrl(`/uploads/covers/${file}`)).toBe(true);
    expect(isValidCoverUrl(`https://cdn.example.com/covers/${file}`)).toBe(false);
    vi.stubEnv("STORAGE_PUBLIC_URL", "https://cdn.example.com/");
    expect(isValidCoverUrl(`https://cdn.example.com/covers/${file}`)).toBe(true);
    expect(isValidCoverUrl(`https://evil.example.com/covers/${file}`)).toBe(false);
    expect(isValidCoverUrl(`https://cdn.example.com/covers/../x.webp`)).toBe(false);
    expect(isValidCoverUrl(`https://cdn.example.com/covers/${file}?x=1`)).toBe(false);
  });
});
