/**
 * Grovastra — Allowed Test Templates Allowlist
 *
 * For the testing phase, only these exact WhatsApp template names are permitted:
 * 1. hello_world
 * 2. jaspers_market_plain_text_v1
 * 3. jaspers_market_order_confirmation_v1
 *
 * All three templates use language en_US and exist on the connected Meta WABA.
 *
 * This allowlist is enforced in the customer-facing Templates page and Campaign Wizard.
 */
export const ALLOWED_TEST_TEMPLATE_NAMES = [
  "hello_world",
  "jaspers_market_plain_text_v1",
  "jaspers_market_order_confirmation_v1",
] as const;

export type AllowedTestTemplateName = typeof ALLOWED_TEST_TEMPLATE_NAMES[number];

export const TEMPLATE_FRIENDLY_NAMES: Record<string, string> = {
  hello_world: "Hello World Greeting",
  jaspers_market_plain_text_v1: "Jasper's Market (Promotional)",
  jaspers_market_order_confirmation_v1: "Jasper's Market (Order Confirmation)",
};

export function getFriendlyTemplateName(name: string): string {
  if (!name || typeof name !== "string") return name;
  return TEMPLATE_FRIENDLY_NAMES[name.trim()] || name;
}

let activeAllowedTemplates: string[] = [...ALLOWED_TEST_TEMPLATE_NAMES];

export function getAllowedTestTemplates(): readonly string[] {
  return activeAllowedTemplates;
}

export function isAllowedTestTemplate(templateName: string): boolean {
  if (!templateName || typeof templateName !== "string") return false;
  return activeAllowedTemplates.includes(templateName.trim());
}

export function setAllowedTestTemplates(templates: string[] | null): void {
  if (!templates) {
    activeAllowedTemplates = [...ALLOWED_TEST_TEMPLATE_NAMES];
  } else {
    activeAllowedTemplates = [...templates];
  }
}

export function addAllowedTestTemplate(templateName: string): void {
  if (!templateName || typeof templateName !== "string") return;
  const trimmed = templateName.trim();
  if (!activeAllowedTemplates.includes(trimmed)) {
    activeAllowedTemplates.push(trimmed);
  }
}


