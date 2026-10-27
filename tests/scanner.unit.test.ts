import { describe, expect, it } from "vitest";
import { normalizeScanInput } from "@/lib/scanner";
import { csvCell, csvRow } from "@/lib/csv";
import { ticketsEmail } from "@/lib/ticket-email";

describe("normalizeScanInput", () => {
  const token = "A".repeat(10) + "b".repeat(10) + "_-".repeat(6);
  it("reads QR tokens as-is", () => expect(normalizeScanInput(token)).toEqual({ kind: "token", value: token }));
  it("accepts typed ticket IDs in any case, with or without dashes", () => {
    expect(normalizeScanInput("7k2m-qx9d-4htb")).toEqual({ kind: "code", value: "7K2M-QX9D-4HTB" });
    expect(normalizeScanInput(" 7K2MQX9D4HTB ")).toEqual({ kind: "code", value: "7K2M-QX9D-4HTB" });
  });
  it("forgives look-alike characters", () => {
    expect(normalizeScanInput("OOOO-IIII-LLLL")).toEqual({ kind: "code", value: "0000-1111-1111" });
  });
  it("rejects anything else", () => {
    for (const bad of ["", "hello", "7K2M-QX9D", "https://evil.example/x", "<script>", "a".repeat(200)]) expect(normalizeScanInput(bad)).toBeNull();
  });
});

describe("csv", () => {
  it("quotes special characters", () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe("");
  });
  it("neutralises spreadsheet formulas", () => {
    for (const evil of ["=1+1", "+cmd", "-2", "@SUM(A1)"]) expect(csvCell(evil).startsWith("'")).toBe(true);
    expect(csvRow(["ok", "=HYPERLINK(1)"])).toBe("ok,'=HYPERLINK(1)");
  });
});

describe("ticketsEmail", () => {
  const base = {
    buyerName: 'Ada <script>alert(1)</script>', orderReference: "T9-ABCDEFGHJK", appUrl: "https://tickets.example/",
    event: { title: "Jazz & Soul <Night>", startsAt: new Date("2026-12-01T18:00:00Z"), endsAt: new Date("2026-12-01T22:00:00Z"), timezone: "Africa/Lagos", venueName: "Main Hall", venueAddress: "1 Road", isOnline: false, onlineUrl: null },
    tickets: [{ code: "7K2M-QX9D-4HTB", qrToken: "T".repeat(32), typeName: "VIP" }, { code: "ABCD-EFGH-JKMN", qrToken: "U".repeat(32), typeName: "Regular" }],
  };
  const mail = ticketsEmail(base);
  it("lists every ticket with code, type and link", () => {
    expect(mail.subject).toBe("Your tickets for Jazz & Soul <Night>");
    for (const t of base.tickets) {
      expect(mail.html).toContain(t.code);
      expect(mail.html).toContain(`https://tickets.example/api/tickets/${t.qrToken}/qr`);
      expect(mail.text).toContain(`https://tickets.example/t/${t.qrToken}`);
    }
  });
  it("escapes user-supplied values in HTML", () => {
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("Ada &lt;script&gt;");
    expect(mail.html).toContain("Jazz &amp; Soul &lt;Night&gt;");
  });
  it("puts no personal data in QR image URLs", () => {
    const urls = [...mail.html.matchAll(/src="([^"]+)"/g)].map((m) => m[1]);
    expect(urls).toHaveLength(2);
    for (const u of urls) { expect(u).not.toMatch(/@|Ada|T9-/); }
  });
  it("uses the singular for one ticket", () => {
    expect(ticketsEmail({ ...base, tickets: [base.tickets[0]] }).subject).toMatch(/^Your ticket for/);
  });
});
