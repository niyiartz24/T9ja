/** All money is stored as integer minor units (e.g. kobo). */
export function toMinor(major: number): number {
  return Math.round(major * 100);
}

export function formatMinor(minor: number, currency = "NGN", locale = "en-NG") {
  if (!Number.isInteger(minor)) throw new Error("Amount must be integer minor units");
  if (minor === 0) return "Free";
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(minor / 100);
}

/** "2500", "2500.5", "2500.50" -> integer kobo. Returns null for anything else. */
export function parseMajorToMinor(input: string): number | null {
  const t = input.trim();
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(t)) return null;
  const [whole, frac = ""] = t.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

export function minorToMajorInput(minor: number): string {
  return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;
}

/** Like formatMinor but never returns "Free": for totals and revenue where zero is a real amount. */
export function formatMoney(minor: number, currency = "NGN", locale = "en-NG") {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(minor / 100);
}
