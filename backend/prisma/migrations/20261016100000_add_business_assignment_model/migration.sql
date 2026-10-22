-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "business_assignments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedById" TEXT,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "assignmentReason" TEXT,
    "revocationReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_assignments_organizationId_idx" ON "business_assignments"("organizationId");

-- CreateIndex
CREATE INDEX "business_assignments_userId_idx" ON "business_assignments"("userId");

-- CreateIndex
CREATE INDEX "business_assignments_assignedById_idx" ON "business_assignments"("assignedById");

-- CreateIndex
CREATE INDEX "business_assignments_status_idx" ON "business_assignments"("status");

-- CreateIndex
CREATE INDEX "business_assignments_organizationId_status_idx" ON "business_assignments"("organizationId", "status");

-- CreateIndex
CREATE INDEX "business_assignments_userId_status_idx" ON "business_assignments"("userId", "status");

-- CreateIndex
CREATE INDEX "business_assignments_organizationId_createdAt_idx" ON "business_assignments"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "business_assignments_status_createdAt_idx" ON "business_assignments"("status", "createdAt");

-- Partial Unique Index (PostgreSQL Level): Enforces at most one ACTIVE assignment per organization.
-- Multiple historical REVOKED assignments for the same organization remain valid.
-- NOTE FOR FUTURE MIGRATION DRIFT SAFETY: This partial index is not natively expressible in Prisma Schema Language (< v8).
-- If future shadow-database migration generation emits a 'DROP INDEX "business_assignments_organizationId_active_unique"',
-- that statement must be removed before deployment to protect business assignment integrity.
CREATE UNIQUE INDEX "business_assignments_organizationId_active_unique" ON "business_assignments"("organizationId") WHERE "status" = 'ACTIVE';

-- AddForeignKey
ALTER TABLE "business_assignments" ADD CONSTRAINT "business_assignments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_assignments" ADD CONSTRAINT "business_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_assignments" ADD CONSTRAINT "business_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
