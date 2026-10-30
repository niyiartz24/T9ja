-- Payments (from earlier updates) and referral codes.
-- Every statement is IF NOT EXISTS, so this is safe even if some of it was already applied.

ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'REVIEW';

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "refundRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "meta" JSONB;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "claimedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Payment_status_idx" ON "Payment"("status");

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referralCode" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_referralCode_key" ON "User"("referralCode");

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "referralCode" TEXT;
CREATE INDEX IF NOT EXISTS "Order_referralCode_idx" ON "Order"("referralCode");
