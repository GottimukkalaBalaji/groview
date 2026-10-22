export interface MockAudience {
  id: string;
  name: string;
  description: string;
  count: number;
  type: "MOCK";
  tags: string[];
}

export const DEMO_AUDIENCES: MockAudience[] = [
  {
    id: "demo-aud-vip",
    name: "VIP Loyalty Members (Demo)",
    description: "Simulated high-tier recurring customers with reward points > 500",
    count: 1250,
    type: "MOCK",
    tags: ["VIP", "High Engagement", "Sample"],
  },
  {
    id: "demo-aud-abandoned",
    name: "Cart Abandoners (Demo)",
    description: "Sample customers with pending uncompleted shopping carts",
    count: 620,
    type: "MOCK",
    tags: ["Recovery", "High Intent", "Sample"],
  },
  {
    id: "demo-aud-inactive",
    name: "Inactive Shoppers 30d (Demo)",
    description: "Simulated audience who have not ordered in the past 30 days",
    count: 840,
    type: "MOCK",
    tags: ["Winback", "Simulated"],
  },
  {
    id: "demo-aud-recent",
    name: "Recent Festival Buyers (Demo)",
    description: "Customers who purchased during previous seasonal promotion",
    count: 1850,
    type: "MOCK",
    tags: ["Seasonal", "Sample"],
  },
  {
    id: "demo-aud-all",
    name: "All Sample Store Contacts (Demo)",
    description: "Combined broadcast list across all sample store contact records",
    count: 4560,
    type: "MOCK",
    tags: ["All Contacts", "Demo Data"],
  },
];
