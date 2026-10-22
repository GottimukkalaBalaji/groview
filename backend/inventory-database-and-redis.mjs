import "file:///C:/Users/BALAJI/Desktop/growViews/grovastra/node_modules/dotenv/config.js";
import { getPrismaClient } from "file:///C:/Users/BALAJI/Desktop/growViews/grovastra/backend/dist/config/prisma.js";
import { getWhatsAppDispatchQueue } from "file:///C:/Users/BALAJI/Desktop/growViews/grovastra/backend/dist/queue/whatsapp.queue.js";

async function main() {
  const prisma = getPrismaClient();
  const queue = getWhatsAppDispatchQueue();

  try {
    console.log("==========================================");
    console.log("       GROVASTRA DATABASE INVENTORY       ");
    console.log("==========================================\n");

    // 1. Organizations
    const orgs = await prisma.organization.findMany({
      include: {
        _count: {
          select: {
            campaigns: true,
            contacts: true,
            contactLists: true,
            users: true,
          },
        },
      },
    });
    console.log(`=== 1. ORGANIZATIONS (${orgs.length}) ===`);
    for (const o of orgs) {
      console.log({
        id: o.id,
        name: o.name,
        slug: o.slug,
        counts: o._count,
        createdAt: o.createdAt,
      });
    }

    // 2. Users
    const users = await prisma.user.findMany({
      include: {
        organization: { select: { id: true, name: true } },
      },
    });
    console.log(`\n=== 2. USERS (${users.length}) ===`);
    for (const u of users) {
      console.log({
        id: u.id,
        email: u.email,
        name: `${u.firstName || ""} ${u.lastName || ""}`.trim(),
        role: u.role,
        orgName: u.organization?.name,
        orgId: u.organizationId,
        createdAt: u.createdAt,
      });
    }

    // 3. Campaigns
    const campaigns = await prisma.campaign.findMany({
      include: {
        organization: { select: { id: true, name: true } },
        _count: { select: { messages: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    console.log(`\n=== 3. CAMPAIGNS (${campaigns.length}) ===`);
    for (const c of campaigns) {
      console.log({
        id: c.id,
        name: c.name,
        status: c.status,
        templateName: c.templateName,
        templateLanguage: c.templateLanguage,
        audienceType: c.audienceType,
        totalRecipients: c.totalRecipients,
        messagesCount: c._count.messages,
        orgName: c.organization?.name,
        orgId: c.organizationId,
        createdAt: c.createdAt,
      });
    }

    // 4. WhatsApp Messages
    const messages = await prisma.whatsAppMessage.findMany({
      include: {
        campaign: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    console.log(`\n=== 4. WHATSAPP MESSAGES (${messages.length}) ===`);
    for (const m of messages) {
      console.log({
        id: m.id,
        status: m.status,
        attemptCount: m.attemptCount,
        hasWamid: Boolean(m.wamid),
        campaignName: m.campaign?.name,
        campaignId: m.campaignId,
        recipientMasked: m.recipientPhone ? `${m.recipientPhone.slice(0, 5)}...${m.recipientPhone.slice(-2)}` : null,
        contactName: m.contact ? `${m.contact.firstName || ""} ${m.contact.lastName || ""}`.trim() : null,
        templateName: m.templateName,
        createdAt: m.createdAt,
      });
    }

    // 5. Contact Lists
    const lists = await prisma.contactList.findMany({
      include: {
        organization: { select: { id: true, name: true } },
        _count: { select: { members: true } },
      },
    });
    console.log(`\n=== 5. CONTACT LISTS (${lists.length}) ===`);
    for (const l of lists) {
      console.log({
        id: l.id,
        name: l.name,
        description: l.description,
        memberCount: l._count.members,
        orgName: l.organization?.name,
        orgId: l.organizationId,
        createdAt: l.createdAt,
      });
    }

    // 6. Contacts summary by organization and consent
    const contacts = await prisma.contact.findMany({
      include: {
        organization: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    console.log(`\n=== 6. CONTACTS SUMMARY (${contacts.length} total) ===`);
    const contactBreakdown = {};
    for (const c of contacts) {
      const key = `${c.organization.name} (${c.organizationId})`;
      if (!contactBreakdown[key]) contactBreakdown[key] = { total: 0, optedIn: 0, pending: 0, optedOut: 0, suppressed: 0 };
      contactBreakdown[key].total++;
      if (c.consentStatus === "OPTED_IN") contactBreakdown[key].optedIn++;
      if (c.consentStatus === "PENDING") contactBreakdown[key].pending++;
      if (c.consentStatus === "OPTED_OUT") contactBreakdown[key].optedOut++;
      if (c.isSuppressed) contactBreakdown[key].suppressed++;
    }
    console.log(JSON.stringify(contactBreakdown, null, 2));

    // Specifically list all contacts
    console.log("\n--- Full Contact Listing ---");
    for (const c of contacts) {
      console.log({
        id: c.id,
        orgName: c.organization?.name,
        name: `${c.firstName || ""} ${c.lastName || ""}`.trim(),
        phoneMasked: c.phoneNumber ? `${c.phoneNumber.slice(0, 5)}...${c.phoneNumber.slice(-2)}` : null,
        consentStatus: c.consentStatus,
        isSuppressed: c.isSuppressed,
        createdAt: c.createdAt,
      });
    }

    // 7. Consent Events
    const consentEvents = await prisma.consentEvent.findMany({
      include: {
        contact: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    console.log(`\n=== 7. CONSENT EVENTS (${consentEvents.length}) ===`);
    for (const ce of consentEvents) {
      console.log({
        id: ce.id,
        contactName: ce.contact ? `${ce.contact.firstName || ""} ${ce.contact.lastName || ""}`.trim() : null,
        event: ce.event,
        source: ce.source,
        createdAt: ce.createdAt,
      });
    }

    // 8. Import Jobs
    const importJobs = await prisma.importJob.findMany({
      include: {
        organization: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    console.log(`\n=== 8. IMPORT JOBS (${importJobs.length}) ===`);
    for (const ij of importJobs) {
      console.log({
        id: ij.id,
        orgName: ij.organization?.name,
        fileName: ij.fileName,
        status: ij.status,
        totalRows: ij.totalRows,
        importedCount: ij.importedCount,
        skippedCount: ij.skippedCount,
        createdAt: ij.createdAt,
      });
    }

    // 9. Webhook Events / Audit
    const webhookEvents = await prisma.webhookEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    console.log(`\n=== 9. WEBHOOK AUDIT EVENTS (${webhookEvents.length}) ===`);
    for (const we of webhookEvents) {
      console.log({
        id: we.id,
        eventType: we.eventType,
        wamid: we.wamid,
        status: we.status,
        createdAt: we.createdAt,
      });
    }

    // 10. Redis Jobs
    const waiting = await queue.getWaiting(0, 50);
    const active = await queue.getActive(0, 50);
    const completed = await queue.getCompleted(0, 50);
    const failed = await queue.getFailed(0, 50);
    const delayed = await queue.getDelayed(0, 50);

    console.log("\n=== 10. REDIS QUEUE JOBS ===");
    console.log({
      waiting: waiting.map(j => ({ id: j.id, messageId: j.data?.messageId, campaignId: j.data?.campaignId })),
      active: active.map(j => ({ id: j.id, messageId: j.data?.messageId, campaignId: j.data?.campaignId })),
      completed: completed.map(j => ({ id: j.id, messageId: j.data?.messageId })),
      failed: failed.map(j => ({ id: j.id, messageId: j.data?.messageId })),
      delayed: delayed.map(j => ({ id: j.id, messageId: j.data?.messageId })),
    });

  } catch (err) {
    console.error("Inventory error:", err);
  } finally {
    await queue.close();
    await prisma.$disconnect();
  }
}

main();
