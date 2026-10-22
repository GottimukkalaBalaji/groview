/**
 * Grovastra Server-Side Platform Master Admin Provisioning Script
 *
 * SAFEGUARDS:
 * 1. CLI Execution Only: Must be executed directly on the server console by a trusted platform operator.
 * 2. Explicit Confirmation: Requires --confirm flag; otherwise performs a safe dry-run preview.
 * 3. Never Public: Not exposed via HTTP routes, signup, or customer profile APIs.
 * 4. Zero Secret Printing: Never prints passwords, tokens, or encryption keys.
 * 5. Audit Logging: Logs the exact user ID, email, organization ID, and timestamp.
 *
 * USAGE:
 * Dry run:
 *   npx ts-node src/scripts/provisionMasterAdmin.ts --email admin@example.com
 * Execute provisioning:
 *   npx ts-node src/scripts/provisionMasterAdmin.ts --email admin@example.com --confirm
 */

import { getPrismaClient } from "../config/prisma.js";

async function provisionMasterAdmin() {
  const args = process.argv.slice(2);
  const emailIndex = args.indexOf("--email");
  const hasConfirm = args.includes("--confirm");

  if (emailIndex === -1 || !args[emailIndex + 1]) {
    console.error("Usage Error: Missing required --email <user-email> argument.");
    console.error("Example: npx ts-node src/scripts/provisionMasterAdmin.ts --email operator@example.com [--confirm]");
    process.exit(1);
  }

  const targetEmail = args[emailIndex + 1].trim().toLowerCase();
  const prisma = getPrismaClient();

  try {
    const user = await prisma.user.findFirst({
      where: {
        email: {
          equals: targetEmail,
          mode: "insensitive",
        },
      },
      include: {
        organization: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    if (!user) {
      console.error(`Target User Error: No user found matching email "${targetEmail}".`);
      process.exit(1);
    }

    const currentPlatformRole = (user as any).platformRole || "NONE";

    console.info("=== Platform Master Admin Provisioning ===");
    console.info(`User ID:           ${user.id}`);
    console.info(`Email:             ${user.email}`);
    console.info(`Name:              ${user.firstName} ${user.lastName || ""}`);
    console.info(`Tenant Org:        ${user.organization.name} (${user.organization.id})`);
    console.info(`Tenant Role:       ${user.role}`);
    console.info(`Current Plat Role: ${currentPlatformRole}`);
    console.info(`Target Plat Role:  PLATFORM_MASTER_ADMIN`);
    console.info("==========================================");

    if (currentPlatformRole === "PLATFORM_MASTER_ADMIN") {
      console.info(`Notice: User is already configured with PLATFORM_MASTER_ADMIN.`);
      process.exit(0);
    }

    if (!hasConfirm) {
      console.info("\n[DRY RUN] No database changes were made.");
      console.info("To apply this provisioning, append the --confirm flag:");
      console.info(`  npx tsx src/scripts/provisionMasterAdmin.ts --email ${targetEmail} --confirm\n`);
      process.exit(0);
    }

    // Apply the update
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        platformRole: "PLATFORM_MASTER_ADMIN" as any,
      },
      select: {
        id: true,
        email: true,
        role: true,
        updatedAt: true,
      },
    });

    console.info(`\n[SUCCESS] Successfully granted PLATFORM_MASTER_ADMIN to user ${updated.email} (${updated.id}).`);
    console.info(`Audit Timestamp: ${updated.updatedAt.toISOString()}`);
  } catch (error) {
    console.error("Provisioning Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

provisionMasterAdmin();
