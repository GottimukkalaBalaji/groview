import "file:///C:/Users/BALAJI/Desktop/growViews/grovastra/node_modules/dotenv/config.js";
import { getPrismaClient } from "file:///C:/Users/BALAJI/Desktop/growViews/grovastra/backend/dist/config/prisma.js";
import crypto from "crypto";

async function main() {
  const prisma = getPrismaClient();

  const user = await prisma.user.findFirst({
    where: { email: "test1@gmail.com" },
    include: { organization: true },
  });

  if (!user) {
    console.log("User test1@gmail.com not found");
    return;
  }

  // Create temporary session
  const plainToken = "test_token_" + crypto.randomBytes(16).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(plainToken).digest("hex");

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      organizationId: user.organizationId,
      tokenHash,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });

  try {
    console.log("Calling GET http://localhost:5000/api/v1/templates?force=true on running server...");
    const res = await fetch("http://localhost:5000/api/v1/templates?force=true", {
      headers: {
        Authorization: `Bearer ${plainToken}`,
      },
    });

    const body = await res.json();
    console.log("Status:", res.status);
    console.log("Body:", JSON.stringify(body, null, 2));

    console.log("\nCalling POST http://localhost:5000/api/v1/campaigns/cmvavcv1o000dt8ictu1aalam/send on running server...");
    const sendRes = await fetch("http://localhost:5000/api/v1/campaigns/cmvavcv1o000dt8ictu1aalam/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${plainToken}`,
      },
    });

    const sendBody = await sendRes.json();
    console.log("Send Status:", sendRes.status);
    console.log("Send Body:", JSON.stringify(sendBody, null, 2));
  } finally {
    // Delete test session
    await prisma.session.delete({ where: { id: session.id } });
    await prisma.$disconnect();
  }
}

main();
