import { afterEach, describe, expect, it, vi } from "vitest";
import { bankDetails, manualProvider } from "@/lib/payments/manual";
import { getProvider } from "@/lib/payments/registry";
import { instructionsOf } from "@/lib/payments/instructions";
import { newReferralCode, normalizeReferral, REFERRAL_RE } from "@/lib/referral";
import { ticketsEmail } from "@/lib/ticket-email";

afterEach(() => vi.unstubAllEnvs());

describe("manual bank transfer provider", () => {
  it("uses the Ticket9ja VFD MFB account by default and allows an override", () => {
    expect(bankDetails()).toEqual({ bankName: "VFD MFB", accountNumber: "1048926078", accountName: "Ticket9ja" });
    vi.stubEnv("MANUAL_BANK_ACCOUNT_NUMBER", "0123456789");
    expect(bankDetails().accountNumber).toBe("0123456789");
  });
  it("returns instructions with the order reference as the narration", async () => {
    const r = await manualProvider.initialize({ paymentReference: "P9-x", orderReference: "T9-ABCDEFGHJK", amountMinor: 500000, currency: "NGN", buyerName: "A", buyerEmail: "a@b.co", callbackUrl: "" });
    expect(r.authorizationUrl).toBeUndefined();
    expect(r.instructions).toMatchObject({ accountNumber: "1048926078", amountMinor: 500000, narration: "T9-ABCDEFGHJK" });
    expect(instructionsOf({ instructions: r.instructions })?.narration).toBe("T9-ABCDEFGHJK");
  });
  it("is pending until the admin records a confirmation, and never trusts webhooks", async () => {
    expect((await manualProvider.verify("P9-x", {})).status).toBe("pending");
    expect((await manualProvider.verify("P9-x", { claim: { senderName: "Me" } })).status).toBe("pending"); // a customer's claim is not a confirmation
    expect(await manualProvider.verify("P9-x", { confirmation: { status: "success", amountMinor: 500000, currency: "NGN" } })).toMatchObject({ status: "success", amountMinor: 500000, currency: "NGN" });
    expect((await manualProvider.verify("P9-x", { confirmation: { status: "failed" } })).status).toBe("failed");
    expect(manualProvider.validateWebhook("{}", new Headers({ hash: "x" }))).toBe(false);
    expect(manualProvider.parseWebhook("{}")).toBeNull();
  });
  it("is allowed in production, unlike the mock provider", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(getProvider("manual").name).toBe("manual");
    expect(() => getProvider("mock")).toThrow(/production/);
  });
});

describe("referral codes", () => {
  it("generates well-formed unique codes", () => {
    const codes = new Set(Array.from({ length: 1000 }, newReferralCode));
    expect(codes.size).toBe(1000);
    for (const c of codes) expect(c).toMatch(REFERRAL_RE);
  });
  it("accepts only exactly formed codes, case-insensitively", () => {
    expect(normalizeReferral(" ref-7k2mqx ")).toBe("REF-7K2MQX");
    for (const bad of ["", "REF-123", "REF-7K2MQX9", "7K2MQX", "<script>", "REF-7K2MQ!", null, undefined, 42]) expect(normalizeReferral(bad)).toBeNull();
  });
});

describe("receipt in the ticket email", () => {
  const data = {
    buyerName: "Ada", orderReference: "T9-ABCDEFGHJK", appUrl: "https://tickets.example",
    event: { title: "Jazz", startsAt: new Date("2026-12-01T18:00:00Z"), endsAt: new Date("2026-12-01T22:00:00Z"), timezone: "Africa/Lagos", venueName: "Hall", venueAddress: "1 Road", isOnline: false, onlineUrl: null },
    tickets: [{ code: "7K2M-QX9D-4HTB", qrToken: "T".repeat(32), typeName: "VIP" }],
  };
  it("shows the total paid and the referral code", () => {
    const m = ticketsEmail({ ...data, receipt: { totalMinor: 500000, currency: "NGN", referralCode: "REF-7K2MQX" } });
    expect(m.html).toContain("REF-7K2MQX");
    expect(m.html).toContain("Total paid");
    expect(m.text).toContain("Referral code: REF-7K2MQX");
    expect(m.text).toMatch(/Total paid: .*5,000/);
  });
  it("omits the referral row when there is none, and shows Free for free tickets", () => {
    const m = ticketsEmail({ ...data, receipt: { totalMinor: 0, currency: "NGN", referralCode: null } });
    expect(m.html).not.toContain("Referral code");
    expect(m.text).toContain("Total paid: Free");
  });
  it("keeps the QR image URL free of the referral code and other personal data", () => {
    const m = ticketsEmail({ ...data, receipt: { totalMinor: 0, currency: "NGN", referralCode: "REF-7K2MQX" } });
    for (const u of [...m.html.matchAll(/src="([^"]+)"/g)].map((x) => x[1])) expect(u).not.toMatch(/REF-|Ada|T9-/);
  });
});
