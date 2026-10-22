import "file:///C:/Users/BALAJI/Desktop/growViews/grovastra/node_modules/dotenv/config.js";
import { getPrismaClient } from "file:///C:/Users/BALAJI/Desktop/growViews/grovastra/backend/dist/config/prisma.js";

async function main() {
  const prisma = getPrismaClient();

  try {
    const session = await prisma.session.findFirst({
      where: {
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!session) {
      console.log("No active session found in DB");
      return;
    }

    console.log("Found session for user:", session.user.email, "Org:", session.user.organization.name);
    
    // Call running server on port 5000
    const res = await fetch("http://localhost:5000/api/v1/templates?force=true", {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    });

    const body = await res.json();
    console.log("Response from running backend on port 5000 (PID 51204):");
    console.log("Status:", res.status);
    console.log("Body:", body);
  } catch (err) {
    console.error("Test error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
