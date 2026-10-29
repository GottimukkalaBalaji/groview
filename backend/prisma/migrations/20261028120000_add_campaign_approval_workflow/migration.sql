-- CreateEnum
CREATE TYPE "CampaignApprovalStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

-- AlterTable: Add approval workflow audit fields and dispatch run
ALTER TABLE "campaigns" ADD COLUMN "approvalStatus" "CampaignApprovalStatus" NOT NULL DEFAULT 'NOT_REQUIRED';
ALTER TABLE "campaigns" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "campaigns" ADD COLUMN "approvedBy" TEXT;
ALTER TABLE "campaigns" ADD COLUMN "approvalNotes" TEXT;
ALTER TABLE "campaigns" ADD COLUMN "rejectedAt" TIMESTAMP(3);
ALTER TABLE "campaigns" ADD COLUMN "rejectedBy" TEXT;
ALTER TABLE "campaigns" ADD COLUMN "rejectionReason" TEXT;
ALTER TABLE "campaigns" ADD COLUMN "dispatchRun" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "campaigns_organizationId_approvalStatus_idx" ON "campaigns"("organizationId", "approvalStatus");

-- Safe Data Backfill:
-- 1. Historical completed, cancelled, and failed campaigns remain NOT_REQUIRED
UPDATE "campaigns"
SET "approvalStatus" = 'NOT_REQUIRED'
WHERE "status" IN ('COMPLETED', 'CANCELLED', 'FAILED');

-- 2. Immediate Send Now drafts (no scheduledAt) remain NOT_REQUIRED
UPDATE "campaigns"
SET "approvalStatus" = 'NOT_REQUIRED'
WHERE "status" = 'DRAFT' AND "scheduledAt" IS NULL;

-- 3. Any scheduled campaigns in DRAFT, SCHEDULED, or QUEUED must default to PENDING (never silently approved)
UPDATE "campaigns"
SET "approvalStatus" = 'PENDING'
WHERE "scheduledAt" IS NOT NULL AND "status" IN ('DRAFT', 'SCHEDULED', 'QUEUED');
