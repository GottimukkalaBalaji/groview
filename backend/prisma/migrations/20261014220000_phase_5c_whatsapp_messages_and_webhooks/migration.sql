-- CreateEnum
CREATE TYPE "MessageDeliveryStatus" AS ENUM ('QUEUED', 'SENDING', 'SUBMITTED_UNCONFIRMED', 'ACCEPTED', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "whatsapp_messages" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campaignId" TEXT,
    "campaignNameSnapshot" VARCHAR(100),
    "contactId" TEXT,
    "dispatchRun" INTEGER NOT NULL DEFAULT 1,
    "clientRequestId" VARCHAR(64),
    "recipientPhone" VARCHAR(20) NOT NULL,
    "templateName" VARCHAR(100) NOT NULL,
    "templateLanguage" VARCHAR(10) NOT NULL DEFAULT 'en_US',
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "wamid" VARCHAR(128),
    "status" "MessageDeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "errorCode" VARCHAR(50),
    "errorMessage" VARCHAR(500),
    "isTerminalFailure" BOOLEAN NOT NULL DEFAULT false,
    "workerId" VARCHAR(100),
    "leaseExpiresAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastAttemptAt" TIMESTAMP(3),
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "messageId" TEXT,
    "wabaId" VARCHAR(64),
    "phoneNumberId" VARCHAR(64),
    "eventType" VARCHAR(50) NOT NULL,
    "wamid" VARCHAR(128),
    "status" VARCHAR(50),
    "eventTimestamp" TIMESTAMP(3) NOT NULL,
    "dedupHash" VARCHAR(64) NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processingError" VARCHAR(500),
    "retainedUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_messages_wamid_key" ON "whatsapp_messages"("wamid");

-- CreateIndex
CREATE INDEX "whatsapp_messages_organizationId_campaignId_status_idx" ON "whatsapp_messages"("organizationId", "campaignId", "status");

-- CreateIndex
CREATE INDEX "whatsapp_messages_organizationId_recipientPhone_idx" ON "whatsapp_messages"("organizationId", "recipientPhone");

-- CreateIndex
CREATE INDEX "whatsapp_messages_organizationId_createdAt_idx" ON "whatsapp_messages"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_messages_campaignId_contactId_dispatchRun_key" ON "whatsapp_messages"("campaignId", "contactId", "dispatchRun");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_messages_organizationId_clientRequestId_key" ON "whatsapp_messages"("organizationId", "clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_dedupHash_key" ON "webhook_events"("dedupHash");

-- CreateIndex
CREATE INDEX "webhook_events_wamid_idx" ON "webhook_events"("wamid");

-- CreateIndex
CREATE INDEX "webhook_events_organizationId_createdAt_idx" ON "webhook_events"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "webhook_events_retainedUntil_idx" ON "webhook_events"("retainedUntil");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_organizationId_id_key" ON "campaigns"("organizationId", "id");

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_organizationId_campaignId_fkey" FOREIGN KEY ("organizationId", "campaignId") REFERENCES "campaigns"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_organizationId_contactId_fkey" FOREIGN KEY ("organizationId", "contactId") REFERENCES "contacts"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "whatsapp_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
