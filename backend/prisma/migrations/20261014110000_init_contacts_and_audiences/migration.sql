-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('OPTED_IN', 'OPTED_OUT', 'PENDING', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ConsentEventType" AS ENUM ('OPT_IN', 'OPT_OUT', 'SUPPRESS', 'UNSUPPRESS');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN "clientRequestId" VARCHAR(64);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "phoneNumber" VARCHAR(20) NOT NULL,
    "countryCode" VARCHAR(4),
    "firstName" VARCHAR(100),
    "lastName" VARCHAR(100),
    "email" VARCHAR(255),
    "customAttributes" JSONB NOT NULL DEFAULT '{}',
    "consentStatus" "ConsentStatus" NOT NULL DEFAULT 'PENDING',
    "consentSource" VARCHAR(100),
    "consentTimestamp" TIMESTAMP(3),
    "consentProof" VARCHAR(255),
    "isSuppressed" BOOLEAN NOT NULL DEFAULT false,
    "suppressedAt" TIMESTAMP(3),
    "suppressionReason" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_lists" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_list_members" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" VARCHAR(50) DEFAULT 'CSV_IMPORT',

    CONSTRAINT "contact_list_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "eventType" "ConsentEventType" NOT NULL,
    "source" VARCHAR(100) NOT NULL,
    "evidence" VARCHAR(500),
    "performedBy" VARCHAR(100) DEFAULT 'system_user',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "parentJobId" TEXT,
    "listId" TEXT,
    "fileName" VARCHAR(255) NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "fileHash" VARCHAR(64) NOT NULL,
    "clientRequestId" VARCHAR(64) NOT NULL,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'PENDING',
    "workerId" VARCHAR(100),
    "leaseExpiresAt" TIMESTAMP(3),
    "leaseVersion" INTEGER NOT NULL DEFAULT 0,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "processedRows" INTEGER NOT NULL DEFAULT 0,
    "lastProcessedRow" INTEGER NOT NULL DEFAULT 0,
    "createdContacts" INTEGER NOT NULL DEFAULT 0,
    "updatedContacts" INTEGER NOT NULL DEFAULT 0,
    "addedToList" INTEGER NOT NULL DEFAULT 0,
    "skippedDuplicates" INTEGER NOT NULL DEFAULT 0,
    "skippedSuppressed" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "rowErrors" JSONB NOT NULL DEFAULT '[]',
    "failureReason" VARCHAR(500),
    "operatorConsentDeclaration" VARCHAR(1000),
    "declaredBy" VARCHAR(100) DEFAULT 'system_user',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_organizationId_clientRequestId_key" ON "campaigns"("organizationId", "clientRequestId");

-- CreateIndex
CREATE INDEX "contacts_organizationId_consentStatus_isSuppressed_idx" ON "contacts"("organizationId", "consentStatus", "isSuppressed");

-- CreateIndex
CREATE INDEX "contacts_organizationId_createdAt_idx" ON "contacts"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_organizationId_phoneNumber_key" ON "contacts"("organizationId", "phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_organizationId_id_key" ON "contacts"("organizationId", "id");

-- CreateIndex
CREATE INDEX "contact_lists_organizationId_createdAt_idx" ON "contact_lists"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "contact_lists_organizationId_name_key" ON "contact_lists"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "contact_lists_organizationId_id_key" ON "contact_lists"("organizationId", "id");

-- CreateIndex: Case-insensitive unique list name index per organization
CREATE UNIQUE INDEX "contact_lists_org_name_lower_idx" ON "contact_lists"("organizationId", LOWER("name"));

-- CreateIndex
CREATE INDEX "contact_list_members_organizationId_listId_idx" ON "contact_list_members"("organizationId", "listId");

-- CreateIndex
CREATE INDEX "contact_list_members_organizationId_contactId_idx" ON "contact_list_members"("organizationId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "contact_list_members_listId_contactId_key" ON "contact_list_members"("listId", "contactId");

-- CreateIndex
CREATE INDEX "consent_events_organizationId_contactId_idx" ON "consent_events"("organizationId", "contactId");

-- CreateIndex
CREATE INDEX "consent_events_organizationId_eventType_createdAt_idx" ON "consent_events"("organizationId", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "import_jobs_organizationId_status_idx" ON "import_jobs"("organizationId", "status");

-- CreateIndex
CREATE INDEX "import_jobs_organizationId_createdAt_idx" ON "import_jobs"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "import_jobs_organizationId_clientRequestId_attemptNumber_key" ON "import_jobs"("organizationId", "clientRequestId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "import_jobs_organizationId_id_key" ON "import_jobs"("organizationId", "id");

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_lists" ADD CONSTRAINT "contact_lists_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_list_members" ADD CONSTRAINT "contact_list_members_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_list_members" ADD CONSTRAINT "contact_list_members_organizationId_listId_fkey" FOREIGN KEY ("organizationId", "listId") REFERENCES "contact_lists"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_list_members" ADD CONSTRAINT "contact_list_members_organizationId_contactId_fkey" FOREIGN KEY ("organizationId", "contactId") REFERENCES "contacts"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_organizationId_contactId_fkey" FOREIGN KEY ("organizationId", "contactId") REFERENCES "contacts"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_organizationId_parentJobId_fkey" FOREIGN KEY ("organizationId", "parentJobId") REFERENCES "import_jobs"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_organizationId_listId_fkey" FOREIGN KEY ("organizationId", "listId") REFERENCES "contact_lists"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
