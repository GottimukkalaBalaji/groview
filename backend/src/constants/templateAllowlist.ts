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
 * This allowlist is enforced on customer-facing API responses and backend
 * campaign creation, update, and launch validation.
 */
export const ALLOWED_TEST_TEMPLATE_NAMES = [
  "hello_world",
  "jaspers_market_plain_text_v1",
  "jaspers_market_order_confirmation_v1",
] as const;

export type AllowedTestTemplateName = typeof ALLOWED_TEST_TEMPLATE_NAMES[number];

let activeAllowedTemplates: string[] = [...ALLOWED_TEST_TEMPLATE_NAMES];

export function getAllowedTestTemplates(): readonly string[] {
  return activeAllowedTemplates;
}

export function isAllowedTestTemplate(templateName: string): boolean {
  if (!templateName || typeof templateName !== "string") return false;
  return activeAllowedTemplates.includes(templateName.trim());
}

/**
 * Allows programmatic expansion of the allowlist (for future approved templates or test suites).
 */
export function setAllowedTestTemplates(templates: string[] | null): void {
  if (!templates) {
    activeAllowedTemplates = [...ALLOWED_TEST_TEMPLATE_NAMES];
  } else {
    activeAllowedTemplates = [...templates];
  }
}
