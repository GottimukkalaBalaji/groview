/**
 * Grovastra Server-Side Password Reset Utility
 *
 * SAFEGUARDS:
 * 1. CLI Execution Only: Must be executed directly on the server console by an authorized administrator.
 * 2. Identity Verification: Verifies that exactly one matching account exists before taking action.
 * 3. Scope Restriction: Updates ONLY the `passwordHash` field; leaves ID, roles, and organization untouched.
 * 4. Algorithm Consistency: Directly uses `hashPassword` (bcrypt, cost 12) from `src/utils/crypto.ts`.
 * 5. Password Validation: Strictly enforces Grovastra password complexity requirements.
 * 6. Zero Secret Printing: Never prints or logs plaintext passwords or hashes.
 * 7. Hidden Input: Prompts for password interactively without echoing to the terminal.
 *
 * USAGE:
 * Interactive (hidden prompt):
 *   npx tsx src/scripts/resetPassword.ts --email user@example.com
 *
 * Piped stdin:
 *   echo "SecretPass123!" | npx tsx src/scripts/resetPassword.ts --email user@example.com
 */

import readline from "readline";
import { getPrismaClient } from "../config/prisma.js";
import { hashPassword } from "../utils/crypto.js";

function promptHidden(query: string): Promise<string> {
  if (!process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin });
    return new Promise((resolve) => {
      rl.question("", (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  return new Promise((resolve) => {
    process.stdout.write(query);
    let password = "";

    const onData = (char: Buffer) => {
      const str = char.toString("utf-8");

      // Enter / Line feed
      if (str === "\n" || str === "\r" || str === "\u0004") {
        process.stdin.removeListener("data", onData);
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        process.stdout.write("\n");
        resolve(password);
        return;
      }

      // Backspace
      if (str === "\u0008" || str === "\u007f") {
        if (password.length > 0) {
          password = password.slice(0, -1);
        }
        return;
      }

      // Ctrl+C
      if (str === "\u0003") {
        process.exit(1);
      }

      password += str;
    };

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

function validatePasswordStrength(password: string): string | null {
  if (!password || password.length < 8) {
    return "Password must be at least 8 characters long.";
  }
  if (password.length > 128) {
    return "Password cannot exceed 128 characters.";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must contain at least one uppercase letter.";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must contain at least one lowercase letter.";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must contain at least one numeric digit.";
  }
  return null;
}

async function resetPassword() {
  const args = process.argv.slice(2);
  const emailIndex = args.indexOf("--email");

  if (emailIndex === -1 || !args[emailIndex + 1]) {
    console.error("Usage Error: Missing required --email <user-email> argument.");
    console.error("Example: npx tsx src/scripts/resetPassword.ts --email operator@example.com");
    process.exit(1);
  }

  const targetEmail = args[emailIndex + 1].trim().toLowerCase();
  const prisma = getPrismaClient();

  try {
    // 1. Verify that exactly one user matches
    const users = await prisma.user.findMany({
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

    if (users.length === 0) {
      console.error(`Target User Error: No user found matching email "${targetEmail}".`);
      process.exit(1);
    }

    if (users.length > 1) {
      console.error(`Integrity Error: Multiple users matched email "${targetEmail}". Aborting for safety.`);
      process.exit(1);
    }

    const user = users[0];

    console.info("=== Grovastra Secure Password Reset ===");
    console.info(`User ID:       ${user.id}`);
    console.info(`Email:         ${user.email}`);
    console.info(`Name:          ${user.firstName} ${user.lastName || ""}`);
    console.info(`Tenant Org:    ${user.organization.name} (${user.organization.id})`);
    console.info(`Tenant Role:   ${user.role}`);
    console.info(`Platform Role: ${user.platformRole}`);
    console.info("========================================");

    // 2. Prompt for new password securely
    const newPassword = await promptHidden("Enter new password: ");
    const validationError = validatePasswordStrength(newPassword);
    if (validationError) {
      console.error(`Validation Error: ${validationError}`);
      process.exit(1);
    }

    // 3. Confirm password if interactive TTY
    if (process.stdin.isTTY) {
      const confirmPassword = await promptHidden("Confirm new password: ");
      if (newPassword !== confirmPassword) {
        console.error("Validation Error: Passwords do not match. Aborting reset.");
        process.exit(1);
      }
    }

    // 4. Hash using bcrypt (12 rounds) via application utility
    const newPasswordHash = await hashPassword(newPassword);

    // 5. Update only passwordHash field
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPasswordHash,
      },
      select: {
        id: true,
        email: true,
        role: true,
        platformRole: true,
        updatedAt: true,
      },
    });

    console.info(`\n[SUCCESS] Successfully updated password for user ${updated.email} (${updated.id}).`);
    console.info(`Tenant Role:    ${updated.role} (Preserved)`);
    console.info(`Platform Role:  ${updated.platformRole} (Preserved)`);
    console.info(`Audit Time:     ${updated.updatedAt.toISOString()}`);
  } catch (error) {
    console.error("Password Reset Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

resetPassword();
