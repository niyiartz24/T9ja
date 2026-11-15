import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { koboToNaira, korapayProvider, korapaySignatureMatches, mapKoraStatus, nairaToKobo } from "@/lib/payments/korapay";
import { enabledProviderNames, enabledProviders, getProvider } from "@/lib/payments/registry";
import { instructionsOf } from "@/lib/payments/instructions";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const KEY = "sk_test_abc123";
const data = { reference: "P9-abc", currency: "NGN", amount: 5000.5, fee: 53, status: "success", payment_method: "card" };
const sign = (d: unknown, key = KEY) => createHmac("sha256", key).update(JSON.stringify(d)).digest("hex");
const hook = (event = "charge.success", d: object = data) => JSON.stringify({ event, data: d });
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("Korapay webhook signature", () => {
  it("accepts a correct signature, case-insensitively", () => {
    expect(korapaySignatureMatches(data, KEY, sign(data))).toBe(true);
    expect(korapaySignatureMatches(data, KEY, sign(data).toUpperCase())).toBe(true);
  });
  it("rejects a tampered amount, a wrong key and a missing header", () => {
    expect(korapaySignatureMatches({ ...data, amount: 1 }, KEY, sign(data))).toBe(false);
    expect(korapaySignatureMatches(data, "sk_test_other", sign(data))).toBe(false);
    expect(korapaySignatureMatches(data, KEY, null)).toBe(false);
    expect(korapaySignatureMatches(data, KEY, "short")).toBe(false);
    expect(korapaySignatureMatches(data, "", sign(data))).toBe(false);
    expect(korapaySignatureMatches(undefined, KEY, sign(data))).toBe(false);
  });
  it("validates through the provider using the data object of the raw body", () => {
    vi.stubEnv("KORAPAY_SECRET_KEY", KEY);
    expect(korapayProvider.validateWebhook(hook(), new Headers({ "x-korapay-signature": sign(data) }))).toBe(true);
    expect(korapayProvider.validateWebhook(hook("charge.success", { ...data, amount: 1 }), new Headers({ "x-korapay-signature": sign(data) }))).toBe(false);
    expect(korapayProvider.validateWebhook("not json", new Headers({ "x-korapay-signature": sign(data) }))).toBe(false);
    expect(korapayProvider.validateWebhook(hook(), new Headers())).toBe(false);
    vi.stubEnv("KORAPAY_SECRET_KEY", "");
    expect(korapayProvider.validateWebhook(hook(), new Headers({ "x-korapay-signature": sign(data) }))).toBe(false); // no key configured: reject everything
  });
});

describe("Korapay webhook parsing", () => {
  it("only a successful charge counts as a payment, and the id is unique per outcome", () => {
    expect(korapayProvider.parseWebhook(hook())).toEqual({ eventId: "charge.success:P9-abc:success", type: "payment.succeeded", reference: "P9-abc" });
    expect(korapayProvider.parseWebhook(hook("charge.failed", { ...data, status: "failed" }))?.type).toBe("other"); // failures are not final
    expect(korapayProvider.parseWebhook(hook("charge.success", { ...data, status: "processing" }))?.type).toBe("other");
    expect(korapayProvider.parseWebhook(hook("refund.success"))?.type).toBe("other");
  });
  it("ignores malformed bodies", () => {
    expect(korapayProvider.parseWebhook("nope")).toBeNull();
    expect(korapayProvider.parseWebhook(JSON.stringify({ event: "charge.success" }))).toBeNull();
  });
});

describe("status and money", () => {
  it("treats only success as paid", () => {
    expect(mapKoraStatus("success")).toBe("success");
    expect(mapKoraStatus("SUCCESS")).toBe("success");
    for (const s of ["failed", "processing", "pending", "", null, undefined]) expect(mapKoraStatus(s as string)).toBe("pending");
  });
  it("converts naira and kobo without drift", () => {
    expect(nairaToKobo(5000)).toBe(500000);
    expect(nairaToKobo(2500.5)).toBe(250050);
    expect(nairaToKobo(19.99)).toBe(1999);
    expect(koboToNaira(250050)).toBe(2500.5);
  });
});

describe("talking to Korapay", () => {
  const input = { paymentReference: "P9-abc", orderReference: "T9-ABCDEFGHJK", amountMinor: 250050, currency: "NGN", buyerName: "Ada", buyerEmail: "ada@example.com", callbackUrl: "http://localhost:3000/orders/T9-ABCDEFGHJK" };

  it("starts a checkout in naira with our reference and returns the Korapay link", async () => {
    vi.stubEnv("KORAPAY_SECRET_KEY", KEY);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: true, data: { reference: "P9-abc", checkout_url: "https://checkout.korapay.com/KPY-PI-1/pay" } }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await korapayProvider.initialize(input);
    expect(r.authorizationUrl).toBe("https://checkout.korapay.com/KPY-PI-1/pay");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.korapay.com/merchant/api/v1/charges/initialize");
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(init.body)).toMatchObject({ amount: 2500.5, currency: "NGN", reference: "P9-abc", redirect_url: input.callbackUrl, customer: { email: "ada@example.com" }, merchant_bears_cost: true });
  });
  it("refuses a checkout link that is not on korapay.com, and surfaces Korapay errors", async () => {
    vi.stubEnv("KORAPAY_SECRET_KEY", KEY);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ status: true, data: { checkout_url: "https://evil.example.com/pay" } })));
    await expect(korapayProvider.initialize(input)).rejects.toThrow(/unexpected checkout address/);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ status: false, message: "Invalid key" }, 401)));
    await expect(korapayProvider.initialize(input)).rejects.toThrow(/HTTP 401.*Invalid key/);
  });
  it("verifies by our reference and reports what was actually paid", async () => {
    vi.stubEnv("KORAPAY_SECRET_KEY", KEY);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: true, data: { reference: "P9-abc", status: "success", amount: "5000.00", amount_paid: "4000.00", currency: "NGN" } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await korapayProvider.verify("P9-abc")).toEqual({ status: "success", amountMinor: 400000, currency: "NGN", reference: "P9-abc" }); // underpaid: the amount check will send this to review
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.korapay.com/merchant/api/v1/charges/P9-abc");
  });
  it("keeps processing, failed, unknown and not-yet-created charges pending", async () => {
    vi.stubEnv("KORAPAY_SECRET_KEY", KEY);
    for (const status of ["processing", "failed", "pending"]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ status: true, data: { reference: "P9-abc", status, amount_paid: "5000.00", currency: "NGN" } })));
      expect((await korapayProvider.verify("P9-abc")).status).toBe("pending");
    }
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ status: false }, 404)));
    expect((await korapayProvider.verify("P9-abc")).status).toBe("pending");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 500)));
    await expect(korapayProvider.verify("P9-abc")).rejects.toThrow(/HTTP 500/);
  });
});

describe("enabled payment methods", () => {
  it("lists methods in the order chosen, and hides Korapay until its key is set", () => {
    vi.stubEnv("PAYMENT_PROVIDERS", "korapay, manual");
    expect(enabledProviderNames()).toEqual(["manual"]);
    vi.stubEnv("KORAPAY_SECRET_KEY", KEY);
    expect(enabledProviderNames()).toEqual(["korapay", "manual"]);
    vi.stubEnv("PAYMENT_PROVIDERS", "manual,korapay");
    expect(enabledProviderNames()).toEqual(["manual", "korapay"]);
  });
  it("still honours the single-provider setting and ignores junk, duplicates and the removed PayOnUs", () => {
    vi.stubEnv("PAYMENT_PROVIDERS", "");
    vi.stubEnv("PAYMENT_PROVIDER", "manual");
    expect(enabledProviderNames()).toEqual(["manual"]);
    vi.stubEnv("PAYMENT_PROVIDERS", "manual,manual,payonus,nonsense,");
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
  it("gives every method a customer-facing label, registers korapay, and reads saved bank instructions", () => {
    vi.stubEnv("PAYMENT_PROVIDERS", "manual");
    for (const p of enabledProviders()) { expect(p.label.length).toBeGreaterThan(3); expect(p.description.length).toBeGreaterThan(10); }
    expect(getProvider("korapay").name).toBe("korapay");
    const good = { instructions: { kind: "bank_transfer", bankName: "VFD MFB", accountNumber: "1048926078", accountName: "Ticket9ja", amountMinor: 500000 } };
    expect(instructionsOf(good)?.accountNumber).toBe("1048926078");
    expect(instructionsOf({ instructions: { ...good.instructions, kind: "card" } })).toBeNull();
  });
});
