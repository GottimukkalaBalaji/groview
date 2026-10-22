-- CreateEnum
CREATE TYPE "MetaConnectionStatus" AS ENUM ('NOT_CONNECTED', 'PENDING_VERIFICATION', 'CONNECTED', 'TOKEN_EXPIRED', 'DISCONNECTED', 'REVOKED');

-- CreateTable
CREATE TABLE "meta_accounts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "wabaId" VARCHAR(64) NOT NULL,
    "phoneNumberId" VARCHAR(64) NOT NULL,
    "displayPhoneNumber" VARCHAR(30),
    "verifiedName" VARCHAR(100),
    "encryptedAccessToken" TEXT NOT NULL,
    "tokenKeyId" VARCHAR(32) NOT NULL DEFAULT 'v1',
    "tokenExpiresAt" TIMESTAMP(3),
    "status" "MetaConnectionStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "verifiedAt" TIMESTAMP(3),
    "lastError" VARCHAR(500),
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meta_accounts_organizationId_key" ON "meta_accounts"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "meta_accounts_wabaId_key" ON "meta_accounts"("wabaId");

-- CreateIndex
CREATE UNIQUE INDEX "meta_accounts_phoneNumberId_key" ON "meta_accounts"("phoneNumberId");

-- CreateIndex
CREATE INDEX "meta_accounts_wabaId_idx" ON "meta_accounts"("wabaId");

-- CreateIndex
CREATE INDEX "meta_accounts_organizationId_status_idx" ON "meta_accounts"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "meta_accounts" ADD CONSTRAINT "meta_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
