/* eslint-disable no-console */
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();

function maskDatabaseUrl(url: string | undefined): string {
  if (!url) return "<not provided>";
  try {
    const parsed = new URL(url);
    const host = parsed.host;
    const pathname = parsed.pathname;
    const protocol = parsed.protocol;
    return `${protocol}//***:***@${host}${pathname}`;
  } catch {
    return "<malformed URL>";
  }
}

function categorizeError(error: unknown): { category: string; description: string; suggestion: string } {
  if (!(error instanceof Error)) {
    return {
      category: "UNKNOWN_ERROR",
      description: "An unexpected non-Error exception occurred.",
      suggestion: "Check system logs for details.",
    };
  }

  const message = error.message;

  // Prisma Error codes
  if (message.includes("P1000")) {
    return {
      category: "AUTHENTICATION_FAILED",
      description: "Authentication failed. The database user or password provided is incorrect.",
      suggestion:
        "Verify your database password in the Supabase Dashboard (Settings -> Database -> Database password).",
    };
  }
  if (message.includes("Can't reach database server at `db.") || (message.includes("P1001") && message.includes("db."))) {
    return {
      category: "IPV6_ONLY_DIRECT_HOST_UNREACHABLE",
      description:
        "Could not reach direct host `db.<project-ref>.supabase.co:5432`. Supabase direct hosts only resolve via IPv6 AAAA records. On IPv4-only networks, this connection fails.",
      suggestion:
        "Switch DIRECT_URL to use the Supabase connection pooler host in Session mode on port 5432 (e.g. aws-0-[region].pooler.supabase.com:5432/postgres), which is IPv4-compatible.",
    };
  }
  if (message.includes("P1001") || message.includes("Can't reach database server")) {
    return {
      category: "CANNOT_REACH_DATABASE_SERVER",
      description: "Could not reach the database server. Connection timed out or host is unreachable.",
      suggestion:
        "Check that your Supabase project is active (not paused in Free tier) and that outbound port 6543/5432 is not blocked by local network/firewall.",
    };
  }
  if (message.includes("P1003")) {
    return {
      category: "DATABASE_DOES_NOT_EXIST",
      description: "The specified database name does not exist on the PostgreSQL server.",
      suggestion: "Ensure the database path in the connection string is /postgres.",
    };
  }
  if (message.includes("ETIMEDOUT") || message.includes("timed out")) {
    return {
      category: "CONNECTION_TIMEOUT",
      description: "Connection attempt timed out waiting for database response.",
      suggestion:
        "Verify if your Supabase project is paused or warming up, and verify network connectivity.",
    };
  }
  if (message.includes("ENOTFOUND") || message.includes("EAI_AGAIN")) {
    return {
      category: "DNS_RESOLUTION_FAILED",
      description: "Could not resolve the database host domain name.",
      suggestion:
        "Check that the host URL / project reference is spelled correctly and your DNS is working.",
    };
  }
  if (message.includes("SELF_SIGNED_CERT") || message.includes("SSL") || message.includes("certificate")) {
    return {
      category: "SSL_TLS_HANDSHAKE_ERROR",
      description: "SSL/TLS handshake or certificate verification failed.",
      suggestion:
        "Ensure sslmode=require or pgbouncer=true query parameters match Supabase specifications.",
    };
  }

  // Fallback sanitized category
  const sanitized = message
    .replace(/postgresql:\/\/[^@]+@/g, "postgresql://***:***@")
    .replace(/password=[^&\s]+/gi, "password=***");

  return {
    category: "GENERAL_DATABASE_ERROR",
    description: sanitized.slice(0, 300),
    suggestion: "Review Supabase connection parameters and error code.",
  };
}

async function testConnection(
  label: "DATABASE_URL" | "DIRECT_URL",
  url: string | undefined
) {
  console.log(`\n--- Testing ${label} ---`);

  if (!url || url.trim() === "") {
    console.log(`Status: MISSING`);
    console.log(`Error Category: CONFIGURATION_MISSING`);
    console.log(`Suggestion: Please provide ${label} in backend/.env`);
    return { success: false, category: "CONFIGURATION_MISSING" };
  }

  if (url.includes("[YOUR-PASSWORD]") || url.includes("[PROJECT-REF]")) {
    console.log(`Status: UNCONFIGURED (Placeholder detected)`);
    console.log(`Error Category: PLACEHOLDER_TOKENS_PRESENT`);
    console.log(`Masked Target: ${maskDatabaseUrl(url)}`);
    console.log(
      `Suggestion: Replace [YOUR-PASSWORD] and [PROJECT-REF] with actual Supabase project values in backend/.env.`
    );
    return { success: false, category: "PLACEHOLDER_TOKENS_PRESENT" };
  }

  console.log(`Target: ${maskDatabaseUrl(url)}`);

  const client = new PrismaClient({
    datasources: {
      db: { url },
    },
    log: [],
  });

  const startTime = Date.now();
  try {
    // Non-destructive query to verify connectivity and retrieve basic metadata
    const result = await client.$queryRawUnsafe<
      Array<{ version: string; current_database: string }>
    >("SELECT version(), current_database()");

    const latency = Date.now() - startTime;
    const row = result[0];
    const pgVersion = row?.version ? row.version.split(" ")[0] + " " + row.version.split(" ")[1] : "PostgreSQL";
    const dbName = row?.current_database || "unknown";

    console.log(`Status: CONNECTED`);
    console.log(`Latency: ${latency}ms`);
    console.log(`Database Name: ${dbName}`);
    console.log(`Engine Version: ${pgVersion}`);

    await client.$disconnect();
    return { success: true, latency };
  } catch (err) {
    const latency = Date.now() - startTime;
    const { category, description, suggestion } = categorizeError(err);

    console.log(`Status: CONNECTION_FAILED`);
    console.log(`Latency: ${latency}ms`);
    console.log(`Error Category: ${category}`);
    console.log(`Description: ${description}`);
    console.log(`Suggestion: ${suggestion}`);

    try {
      await client.$disconnect();
    } catch {
      // ignore
    }

    return { success: false, category };
  }
}

async function main() {
  console.log("=================================================");
  console.log("  Grovastra Phase 2A: Supabase Connection Test   ");
  console.log("=================================================");

  const databaseUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;

  const dbRes = await testConnection("DATABASE_URL", databaseUrl);
  const directRes = await testConnection("DIRECT_URL", directUrl);

  console.log("\n=================================================");
  console.log("  Summary                                        ");
  console.log("=================================================");
  console.log(`DATABASE_URL (Pooled): ${dbRes.success ? "SUCCESS" : `FAILED (${dbRes.category})`}`);
  console.log(`DIRECT_URL (Direct):   ${directRes.success ? "SUCCESS" : `FAILED (${directRes.category})`}`);

  if (dbRes.success && directRes.success) {
    console.log("\nResult: Both Supabase connection endpoints are validated and ready.");
    process.exit(0);
  } else {
    console.log("\nResult: Database validation completed with reported issues above.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unexpected script execution error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
