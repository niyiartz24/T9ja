import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { koboToNaira, mapPayonusStatus, nairaToKobo, payonusHashMatches, payonusProvider } from "@/lib/payments/payonus";
import { enabledProviderNames, enabledProviders, getProvider } from "@/lib/payments/registry";
import { instructionsOf } from "@/lib/payments/instructions";

afterEach(() => vi.unstubAllEnvs());

const KEY = "verification-key-123";
const body = { id: "evt-1", type: "COLLECTION", accountNumber: "6012343210", onusReference: "ONUS-NUB-xxxx-01012026-010101", paymentStatus: "SUCCESSFUL", merchantReference: "P9-abc", transactionAmount: 50000 };
const sign = (b: { accountNumber: string; onusReference: string; paymentStatus: string }, key = KEY) =>
  createHash("sha256").update(b.accountNumber + b.onusReference + b.paymentStatus + key).digest("hex");

describe("PayOnUs webhook signature", () => {
  it("accepts a correct hash, case-insensitively", () => {
    expect(payonusHashMatches(body, KEY, sign(body))).toBe(true);
    expect(payonusHashMatches(body, KEY, sign(body).toUpperCase())).toBe(true);
  });
  it("rejects a wrong key, a changed signed field and a missing header", () => {
    expect(payonusHashMatches(body, "other-key", sign(body))).toBe(false);
    expect(payonusHashMatches({ ...body, paymentStatus: "FAILED" }, KEY, sign(body))).toBe(false);
    expect(payonusHashMatches({ ...body, accountNumber: "1" }, KEY, sign(body))).toBe(false);
    expect(payonusHashMatches(body, KEY, null)).toBe(false);
    expect(payonusHashMatches(body, KEY, "short")).toBe(false);
    expect(payonusHashMatches(body, "", sign(body))).toBe(false);
  });
  it("validates through the provider using the raw body and the hash header", () => {
    vi.stubEnv("PAYONUS_WEBHOOK_KEY", KEY);
    const raw = JSON.stringify(body);
    expect(payonusProvider.validateWebhook(raw, new Headers({ hash: sign(body) }))).toBe(true);
    expect(payonusProvider.validateWebhook(raw, new Headers({ hash: "0".repeat(64) }))).toBe(false);
    expect(payonusProvider.validateWebhook("not json", new Headers({ hash: sign(body) }))).toBe(false);
    expect(payonusProvider.validateWebhook(raw, new Headers())).toBe(false);
    vi.stubEnv("PAYONUS_WEBHOOK_KEY", "");
    expect(payonusProvider.validateWebhook(raw, new Headers({ hash: sign(body) }))).toBe(false); // no key configured: reject everything
  });
});

describe("PayOnUs webhook parsing", () => {
  it("maps collection results to payment events keyed by id, reference and status", () => {
    expect(payonusProvider.parseWebhook(JSON.stringify(body))).toEqual({ eventId: `evt-1:${body.onusReference}:SUCCESSFUL`, type: "payment.succeeded", reference: "P9-abc" });
    expect(payonusProvider.parseWebhook(JSON.stringify({ ...body, paymentStatus: "FAILED" }))?.type).toBe("payment.failed");
    expect(payonusProvider.parseWebhook(JSON.stringify({ ...body, paymentStatus: "PENDING" }))?.type).toBe("other");
    expect(payonusProvider.parseWebhook(JSON.stringify({ ...body, type: "PAYOUT" }))?.type).toBe("other");
  });
  it("ignores malformed bodies", () => {
    expect(payonusProvider.parseWebhook("nope")).toBeNull();
    expect(payonusProvider.parseWebhook(JSON.stringify({ type: "COLLECTION" }))).toBeNull();
  });
});

describe("status and money mapping", () => {
  it("treats only SUCCESSFUL as paid and only FAILED as failed", () => {
    expect(mapPayonusStatus("SUCCESSFUL")).toBe("success");
    expect(mapPayonusStatus("successful")).toBe("success");
    expect(mapPayonusStatus("FAILED")).toBe("failed");
    for (const s of ["PENDING", "PROCESSING", "WHATEVER", "", null, undefined]) expect(mapPayonusStatus(s as string)).toBe("pending");
  });
  it("converts between naira and kobo without drift", () => {
    expect(nairaToKobo(5000)).toBe(500000);
    expect(nairaToKobo(2500.5)).toBe(250050);
    expect(nairaToKobo(19.99)).toBe(1999);
    expect(koboToNaira(250050)).toBe(2500.5);
    expect(koboToNaira(1999)).toBe(19.99);
  });
});

describe("enabled payment methods", () => {
  const payonusEnv = () => { vi.stubEnv("PAYONUS_CLIENT_ID", "id"); vi.stubEnv("PAYONUS_CLIENT_SECRET", "secret"); vi.stubEnv("PAYONUS_BUSINESS_ID", "biz"); };
  it("lists methods in the order chosen, and hides PayOnUs until it is configured", () => {
    vi.stubEnv("PAYMENT_PROVIDERS", "payonus, manual");
    expect(enabledProviderNames()).toEqual(["manual"]); // PayOnUs has no credentials yet
    payonusEnv();
    expect(enabledProviderNames()).toEqual(["payonus", "manual"]);
    vi.stubEnv("PAYMENT_PROVIDERS", "manual,payonus");
    expect(enabledProviderNames()).toEqual(["manual", "payonus"]);
  });
  it("still honours the single-provider setting and ignores junk and duplicates", () => {
    vi.stubEnv("PAYMENT_PROVIDERS", "");
    vi.stubEnv("PAYMENT_PROVIDER", "manual");
    expect(enabledProviderNames()).toEqual(["manual"]);
    vi.stubEnv("PAYMENT_PROVIDERS", "manual,manual,nonsense,");
    expect(enabledProviderNames()).toEqual(["manual"]);
  });
  it("never offers the mock method in production, and offers nothing when unset", () => {
    vi.stubEnv("PAYMENT_PROVIDERS", "mock,manual");
    expect(enabledProviderNames()).toEqual(["mock", "manual"]);
    vi.stubEnv("NODE_ENV", "production");
    expect(enabledProviderNames()).toEqual(["manual"]);
    vi.stubEnv("PAYMENT_PROVIDERS", "");
    vi.stubEnv("PAYMENT_PROVIDER", "");
    expect(enabledProviders()).toEqual([]);
    expect(() => getProvider()).toThrow(/not configured/i);
  });
  it("gives every method a customer-facing label", () => {
    vi.stubEnv("PAYMENT_PROVIDERS", "manual");
    for (const p of enabledProviders()) { expect(p.label.length).toBeGreaterThan(3); expect(p.description.length).toBeGreaterThan(10); }
  });
  it("registers payonus and reads saved bank instructions", () => {
    expect(getProvider("payonus").name).toBe("payonus");
    const good = { instructions: { kind: "bank_transfer", bankName: "Test Bank", accountNumber: "1212334455", accountName: "Ticket9ja", amountMinor: 500000 } };
    expect(instructionsOf(good)?.accountNumber).toBe("1212334455");
    expect(instructionsOf({ instructions: { ...good.instructions, kind: "card" } })).toBeNull();
  });
});
