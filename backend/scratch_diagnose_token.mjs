import "file:///C:/Users/BALAJI/Desktop/growViews/grovastra/node_modules/dotenv/config.js";
import { getPrismaClient } from "file:///C:/Users/BALAJI/Desktop/growViews/grovastra/backend/dist/config/prisma.js";
import { MetaConfigResolver } from "file:///C:/Users/BALAJI/Desktop/growViews/grovastra/backend/dist/services/metaConfigResolver.js";
import { whatsappTemplateService } from "file:///C:/Users/BALAJI/Desktop/growViews/grovastra/backend/dist/services/whatsappTemplate.service.js";

async function main() {
  const prisma = getPrismaClient();

  try {
    console.log("=== 1. FIND CAMPAIGN 'test' AND ITS ORGANIZATION ===");
    const testCampaigns = await prisma.campaign.findMany({
      where: {
        name: { contains: "test", mode: "insensitive" },
      },
      include: {
        organization: true,
      },
    });

    console.log(`Found ${testCampaigns.length} campaigns matching 'test':`);
    for (const c of testCampaigns) {
      console.log({
        id: c.id,
        name: c.name,
        status: c.status,
        templateName: c.templateName,
        templateLanguage: c.templateLanguage,
        organizationId: c.organizationId,
        orgName: c.organization?.name,
        audienceType: c.audienceType,
        totalRecipients: c.totalRecipients,
      });
    }

    // Also look up festive_mega_savings campaign if named differently
    const festiveCampaigns = await prisma.campaign.findMany({
      where: {
        templateName: { contains: "festive", mode: "insensitive" },
      },
      include: {
        organization: true,
      },
    });
    console.log(`\nFound ${festiveCampaigns.length} campaigns using a 'festive' template:`);
    for (const c of festiveCampaigns) {
      console.log({
        id: c.id,
        name: c.name,
        status: c.status,
        templateName: c.templateName,
        templateLanguage: c.templateLanguage,
        organizationId: c.organizationId,
        orgName: c.organization?.name,
      });
    }

    // 2. Test MetaConfigResolver for each organization involved
    const orgIds = Array.from(new Set([...testCampaigns, ...festiveCampaigns].map((c) => c.organizationId)));
    console.log("\n=== 2. RESOLVE META CONFIG FOR ORGANIZATIONS ===");
    for (const orgId of orgIds) {
      try {
        const config = await MetaConfigResolver.resolveOutboundConfig(orgId);
        console.log(`Org ${orgId}:`, {
          source: config.source,
          mode: config.mode,
          wabaId: config.wabaId ? `***${config.wabaId.slice(-4)}` : "missing",
          phoneNumberId: config.phoneNumberId ? `***${config.phoneNumberId.slice(-4)}` : "missing",
          accessTokenLength: config.accessToken?.length,
          graphApiVersion: config.graphApiVersion,
          status: config.status,
        });

        // Test Meta API template lookup directly using read-only GET
        console.log(`\nTesting Graph API GET /${config.graphApiVersion}/${config.wabaId}/message_templates for org ${orgId}...`);
        const url = `https://graph.facebook.com/${config.graphApiVersion}/${config.wabaId}/message_templates?limit=100`;
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            Accept: "application/json",
          },
        });
        const resJson = await res.json();
        if (!res.ok) {
          console.log(`Graph API Error (${res.status}):`, resJson);
        } else {
          console.log(`Graph API Success (${res.status}). Found ${resJson.data?.length || 0} templates.`);
          // Look for festive_mega_savings and hello_world
          for (const t of resJson.data || []) {
            if (t.name === "festive_mega_savings" || t.name === "hello_world") {
              console.log("Template detail:", {
                id: t.id,
                name: t.name,
                status: t.status,
                language: t.language,
                category: t.category,
              });
            }
          }
        }
      } catch (err) {
        console.error(`Config resolution failed for org ${orgId}:`, err.message);
      }
    }
  } catch (err) {
    console.error("Diagnostic error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
