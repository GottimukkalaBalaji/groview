import "file:///C:/Users/BALAJI/Desktop/growViews/grovastra/node_modules/dotenv/config.js";
import { MetaConfigResolver } from "file:///C:/Users/BALAJI/Desktop/growViews/grovastra/backend/dist/services/metaConfigResolver.js";

async function main() {
  const config = await MetaConfigResolver.resolveOutboundConfig("cmvas7859000nt8zwz8xfipxp");
  let url = `https://graph.facebook.com/${config.graphApiVersion}/${config.wabaId}/message_templates?limit=100`;
  
  let allTemplates = [];
  while (url) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
      },
    });
    const data = await res.json();
    if (data.data) {
      allTemplates.push(...data.data);
    }
    url = data.paging?.next || null;
  }

  console.log(`Total templates on Meta: ${allTemplates.length}`);
  const matching = allTemplates.filter(t => t.name.toLowerCase().includes("festive") || t.name.toLowerCase().includes("mega") || t.name.toLowerCase().includes("savings"));
  console.log("Matching 'festive' or 'mega' or 'savings':", matching.map(t => ({ id: t.id, name: t.name, status: t.status, language: t.language })));

  console.log("\nAll template names on Meta:");
  console.log(allTemplates.map(t => `${t.name} (${t.status}, ${t.language})`).sort());
}

main();
