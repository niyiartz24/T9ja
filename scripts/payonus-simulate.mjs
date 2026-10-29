// Sandbox only: pretends the customer paid the bank transfer for your latest pending PayOnUs payment.
// Usage:  npm run payonus:simulate            (latest pending payment)
//         npm run payonus:simulate -- P9-xxxx  (a specific payment reference)
import { PrismaClient } from "@prisma/client";

if ((process.env.PAYONUS_ENV ?? "sandbox") !== "sandbox") {
  console.error("Refusing to run: PAYONUS_ENV is not sandbox.");
  process.exit(1);
}
const need = (n) => { const v = process.env[n]; if (!v) { console.error(`Missing ${n} in .env`); process.exit(1); } return v; };
const db = new PrismaClient();
const ref = process.argv[2];
const payment = await db.payment.findFirst({
  where: { provider: "payonus", status: "PENDING", ...(ref ? { providerReference: ref } : {}) },
  orderBy: { createdAt: "desc" },
});
if (!payment) { console.error("No pending PayOnUs payment found. Click Pay now on an order first."); process.exit(1); }
const inst = payment.meta?.instructions;
const onusReference = payment.meta?.onusReference;
if (!inst || !onusReference) { console.error("This payment has no stored account details."); process.exit(1); }

const base = "https://core-sandbox.payonus.com";
const auth = await fetch(`${base}/api/v1/access-token`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ apiClientId: need("PAYONUS_CLIENT_ID"), apiClientSecret: need("PAYONUS_CLIENT_SECRET") }),
});
if (!auth.ok) { console.error("Authentication failed:", auth.status, await auth.text()); process.exit(1); }
const body = await auth.json();
const token = body.access_token ?? body.data?.access_token;

const res = await fetch(`${base}/api/v1/fund-ngn-account`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({ onusReference, accountNumber: inst.accountNumber, amount: payment.amountMinor / 100, paymentStatus: "SUCCESSFUL", forDynamicAccount: true }),
});
console.log("PayOnUs sandbox replied:", res.status, (await res.text()).slice(0, 300));
console.log("Now open the order page. It confirms the payment within a few seconds.");
await db.$disconnect();
