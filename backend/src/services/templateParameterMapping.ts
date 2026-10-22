/**
 * Grovastra — Template Parameter Mapping & Positional Resolution Service
 * 
 * Guarantees that template parameters are strictly mapped by their explicit
 * numeric positions ({{1}}, {{2}}, {{3}}), never relying on JavaScript object
 * key enumeration order or database JSONB key ordering.
 */
export { ALLOWED_TEST_TEMPLATE_NAMES, AllowedTestTemplateName, isAllowedTestTemplate } from "../constants/templateAllowlist.js";

export interface TemplateVariableMetadata {
  position: number;       // 1-based index (1, 2, 3...)
  key: string;           // "1", "2", "3"...
  label: string;         // Human-readable label
  canonicalKey: string;  // Canonical property name (e.g. "firstName")
  aliases: string[];     // Permitted alternate lookup keys
  exampleValue?: string;
  required: boolean;
}

export interface KnownTemplateSpec {
  name: string;
  category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
  variableCount: number;
  variables: TemplateVariableMetadata[];
}

/**
 * Authoritative registry of known Meta pre-approved templates and their
 * explicit positional parameter contracts.
 */
export const KNOWN_TEMPLATE_METADATA: Record<string, KnownTemplateSpec> = {
  hello_world: {
    name: "hello_world",
    category: "UTILITY",
    variableCount: 0,
    variables: [],
  },
  jaspers_market_plain_text_v1: {
    name: "jaspers_market_plain_text_v1",
    category: "MARKETING",
    variableCount: 0,
    variables: [],
  },
  jaspers_market_order_confirmation_v1: {
    name: "jaspers_market_order_confirmation_v1",
    category: "UTILITY",
    variableCount: 3,
    variables: [
      {
        position: 1,
        key: "1",
        label: "Customer Name ({{1}})",
        canonicalKey: "firstName",
        aliases: ["1", "{{1}}", "firstName", "customerName", "name"],
        exampleValue: "John",
        required: true,
      },
      {
        position: 2,
        key: "2",
        label: "Order Number ({{2}})",
        canonicalKey: "orderNumber",
        aliases: ["2", "{{2}}", "orderNumber", "orderId"],
        exampleValue: "GRV-10294",
        required: true,
      },
      {
        position: 3,
        key: "3",
        label: "Estimated Delivery ({{3}})",
        canonicalKey: "deliveryDate",
        aliases: ["3", "{{3}}", "deliveryDate", "estimatedDelivery", "deliveryDateString"],
        exampleValue: "Friday, Oct 24",
        required: true,
      },
    ],
  },
  order_confirmation: {
    name: "order_confirmation",
    category: "UTILITY",
    variableCount: 2,
    variables: [
      {
        position: 1,
        key: "1",
        label: "Customer Name ({{1}})",
        canonicalKey: "name",
        aliases: ["1", "{{1}}", "name", "firstName", "customerName"],
        exampleValue: "Alice",
        required: true,
      },
      {
        position: 2,
        key: "2",
        label: "Order Number ({{2}})",
        canonicalKey: "orderId",
        aliases: ["2", "{{2}}", "orderId", "orderNumber"],
        exampleValue: "ORD-999",
        required: true,
      },
    ],
  },
};

export interface MetaComponentParameter {
  type: "text";
  text: string;
}

export interface MetaBodyComponent {
  type: "body";
  parameters: MetaComponentParameter[];
}

/**
 * Resolves template parameters into strictly-ordered positional parameters for Meta Cloud API.
 * Never relies on JavaScript object key iteration order.
 * Maps by explicit numeric positions ({{1}}, {{2}}, {{3}}...) or explicit template metadata.
 */
export function resolvePositionalTemplateParameters(
  templateName: string,
  parameters?: Record<string, unknown>
): MetaComponentParameter[] {
  // 1. Template explicitly configured with zero parameters (e.g. hello_world)
  const knownSpec = KNOWN_TEMPLATE_METADATA[templateName];
  if (templateName === "hello_world" || (knownSpec && knownSpec.variableCount === 0)) {
    return [];
  }

  const rawParams = parameters || {};
  const rawKeys = Object.keys(rawParams);

  if (rawKeys.length === 0) {
    return [];
  }

  // 2. Known template with explicit metadata (e.g. jaspers_market_order_confirmation_v1)
  if (knownSpec && knownSpec.variables.length > 0) {
    const resolved: MetaComponentParameter[] = [];

    // Iterate strictly by 1-based variable position (1, 2, 3...)
    for (const v of knownSpec.variables) {
      let matchedVal: unknown = undefined;

      // Look up through defined aliases first (key "1", "{{1}}", "firstName", etc.)
      for (const alias of v.aliases) {
        if (rawParams[alias] !== undefined && rawParams[alias] !== null) {
          matchedVal = rawParams[alias];
          break;
        }
      }

      // Check numeric fallback if key is e.g. "1" or "{{1}}"
      if (matchedVal === undefined) {
        const numKey = String(v.position);
        const bracedKey = `{{${v.position}}}`;
        if (rawParams[numKey] !== undefined && rawParams[numKey] !== null) {
          matchedVal = rawParams[numKey];
        } else if (rawParams[bracedKey] !== undefined && rawParams[bracedKey] !== null) {
          matchedVal = rawParams[bracedKey];
        }
      }

      if (matchedVal === undefined || matchedVal === null || String(matchedVal).trim() === "") {
        if (v.required) {
          throw new Error(
            `Missing required parameter for template "${templateName}" at position {{${v.position}}} (${v.label}). Available keys: [${rawKeys.join(", ")}].`
          );
        }
      }

      resolved.push({
        type: "text",
        text: String(matchedVal ?? ""),
      });
    }

    return resolved;
  }

  // 3. Dynamic or user-defined templates without pre-registered metadata
  // Extract all keys containing numeric indicators ("1", "{{1}}", "param_1", etc.)
  const numericEntries: Array<{ position: number; val: unknown }> = [];
  const nonNumericKeys: string[] = [];

  for (const [key, val] of Object.entries(rawParams)) {
    const match = key.match(/(?:^|\D)(\d+)(?:\D*$)/);
    if (match) {
      const pos = parseInt(match[1], 10);
      numericEntries.push({ position: pos, val });
    } else {
      nonNumericKeys.push(key);
    }
  }

  if (nonNumericKeys.length > 0 && numericEntries.length === 0) {
    // Purely non-numeric keys without metadata are ambiguous
    throw new Error(
      `Ambiguous template parameter mapping for template "${templateName}". Keys [${nonNumericKeys.join(", ")}] cannot be mapped to positional variables ({{1}}, {{2}}, ...). Use explicit numeric positions ("1", "2") or register explicit template parameter metadata.`
    );
  }

  // Sort strictly in ascending numeric order of their position
  numericEntries.sort((a, b) => a.position - b.position);

  return numericEntries.map((entry) => ({
    type: "text",
    text: String(entry.val),
  }));
}

/**
 * Constructs the components array for Meta Cloud API payload.
 * Returns empty array [] if there are zero body parameters (e.g. hello_world).
 */
export function buildMetaTemplateComponents(
  templateName: string,
  parameters?: Record<string, unknown>
): MetaBodyComponent[] {
  const params = resolvePositionalTemplateParameters(templateName, parameters);
  if (params.length === 0) {
    return [];
  }
  return [
    {
      type: "body",
      parameters: params,
    },
  ];
}

/**
 * Normalizes input parameters into canonical, position-keyed record (e.g. { "1": "Alice", "2": "ORD-123" })
 * for deterministic storage and idempotency hashing.
 */
export function normalizeTemplateParameters(
  templateName: string,
  parameters?: Record<string, unknown>
): Record<string, string> {
  const resolved = resolvePositionalTemplateParameters(templateName, parameters);
  const normalized: Record<string, string> = {};
  resolved.forEach((param, idx) => {
    normalized[String(idx + 1)] = param.text;
  });
  return normalized;
}

export interface ContactVariableInput {
  firstName?: string | null;
  lastName?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  attributes?: unknown;
  customAttributes?: unknown;
}

export interface ResolveContactParametersResult {
  success: boolean;
  parameters?: Record<string, string>;
  error?: string;
  missingField?: string;
}

/**
 * Resolves template parameter mappings dynamically against a recipient contact record.
 * Supports dynamic tokens like {{firstName}}, {{lastName}}, {{name}}, {{phone}}, {{email}},
 * custom attributes like {{attributes.loyaltyTier}}, {{customAttributes.city}} or {{city}}, and static fallback values.
 * If any required variable cannot be resolved, fails safely with an explicit auditable error.
 */
export function resolveContactTemplateParameters(
  templateName: string,
  variablesMapping?: Record<string, unknown> | null,
  contact?: ContactVariableInput
): ResolveContactParametersResult {
  const knownSpec = KNOWN_TEMPLATE_METADATA[templateName];
  if (templateName === "hello_world" || (knownSpec && knownSpec.variableCount === 0)) {
    return { success: true, parameters: {} };
  }

  const rawMapping = variablesMapping || {};
  const intermediateParams: Record<string, string> = {};

  // Helper to extract value from contact
  const resolveTokenFromContact = (token: string): string | null => {
    const lower = token.toLowerCase();
    if (lower === "firstname") return contact?.firstName || null;
    if (lower === "lastname") return contact?.lastName || null;
    if (lower === "name" || lower === "fullname" || lower === "customername") {
      const parts = [contact?.firstName, contact?.lastName].filter(Boolean);
      return parts.length > 0 ? parts.join(" ") : contact?.firstName || null;
    }
    if (lower === "phone" || lower === "phonenumber") return contact?.phoneNumber || null;
    if (lower === "email") return contact?.email || null;

    const attrs =
      (contact?.attributes && typeof contact.attributes === "object"
        ? (contact.attributes as Record<string, unknown>)
        : undefined) ||
      (contact?.customAttributes && typeof contact.customAttributes === "object"
        ? (contact.customAttributes as Record<string, unknown>)
        : undefined);

    if (attrs) {
      if (attrs[token] !== undefined && attrs[token] !== null) {
        return String(attrs[token]);
      }
      const stripped = token.replace(/^(attributes|customattributes)\./i, "");
      if (attrs[stripped] !== undefined && attrs[stripped] !== null) {
        return String(attrs[stripped]);
      }
      const strippedLower = stripped.toLowerCase();
      const matchedKey = Object.keys(attrs).find((k) => k.toLowerCase() === strippedLower);
      if (matchedKey && attrs[matchedKey] !== undefined && attrs[matchedKey] !== null) {
        return String(attrs[matchedKey]);
      }
    }
    return null;
  };

  // If template is known, validate according to its variable contract
  if (knownSpec && knownSpec.variables.length > 0) {
    for (const v of knownSpec.variables) {
      let mappedValue: unknown = undefined;
      for (const alias of v.aliases) {
        if (rawMapping[alias] !== undefined && rawMapping[alias] !== null) {
          mappedValue = rawMapping[alias];
          break;
        }
      }
      if (mappedValue === undefined) {
        const numKey = String(v.position);
        const bracedKey = `{{${v.position}}}`;
        if (rawMapping[numKey] !== undefined) mappedValue = rawMapping[numKey];
        else if (rawMapping[bracedKey] !== undefined) mappedValue = rawMapping[bracedKey];
      }

      if (mappedValue === undefined || mappedValue === null || String(mappedValue).trim() === "") {
        if (v.required) {
          return {
            success: false,
            error: `Missing mapping for required variable ${v.key} (${v.label})`,
            missingField: v.canonicalKey,
          };
        }
        continue;
      }

      const valStr = String(mappedValue).trim();
      const placeholderMatch = valStr.match(/^\{\{([a-zA-Z0-9_\.]+)\}\}$/);

      if (placeholderMatch) {
        const token = placeholderMatch[1];
        const resolvedVal = resolveTokenFromContact(token);
        if (!resolvedVal || resolvedVal.trim() === "") {
          if (v.required) {
            return {
              success: false,
              error: `Contact missing required attribute '${token}' for variable ${v.label}`,
              missingField: token,
            };
          }
          intermediateParams[v.key] = "";
        } else {
          intermediateParams[v.key] = resolvedVal.trim();
        }
      } else {
        // Static literal string
        intermediateParams[v.key] = valStr;
      }
    }
  } else {
    // Dynamic or custom template: resolve all mapping keys
    for (const [key, rawVal] of Object.entries(rawMapping)) {
      if (rawVal === undefined || rawVal === null) continue;
      const valStr = String(rawVal).trim();
      const placeholderMatch = valStr.match(/^\{\{([a-zA-Z0-9_\.]+)\}\}$/);

      if (placeholderMatch) {
        const token = placeholderMatch[1];
        const resolvedVal = resolveTokenFromContact(token);
        if (!resolvedVal || resolvedVal.trim() === "") {
          return {
            success: false,
            error: `Contact missing attribute '${token}' for parameter '${key}'`,
            missingField: token,
          };
        }
        intermediateParams[key] = resolvedVal.trim();
      } else {
        intermediateParams[key] = valStr;
      }
    }
  }

  try {
    const normalized = normalizeTemplateParameters(templateName, intermediateParams);
    return {
      success: true,
      parameters: normalized,
    };
  } catch (normErr: any) {
    return {
      success: false,
      error: normErr?.message || "Failed to normalize template parameters",
    };
  }
}

export interface TemplateMappingValidationResult {
  valid: boolean;
  error?: string;
  expectedPositions: number[];
  variableCount: number;
}

/**
 * Strictly validates template parameter mappings against approved Meta template metadata
 * BEFORE any database records or queue jobs are created.
 *
 * Enforces:
 * 1. Exact positional parameter count matching Meta template specification.
 * 2. Contiguous 1-indexed positions ([1, 2, ..., N]).
 * 3. Rejection of missing, extra, unrecognized, or ambiguous parameters.
 * 4. Rejection of malformed placeholder tokens (e.g. "{{firstName").
 * 5. Fails closed if template metadata is unavailable or cannot be trusted.
 */
export function validateCampaignTemplateMapping(
  template: import("../types/template.js").NormalizedWhatsAppTemplate,
  variablesMapping?: Record<string, unknown> | null
): TemplateMappingValidationResult {
  const rawMapping = variablesMapping || {};
  const templateName = template.name;
  const knownSpec = KNOWN_TEMPLATE_METADATA[templateName];

  // 1. Determine expected variable positions & permitted aliases
  let expectedPositions: number[] = [];
  const allowedAliases: Map<number, string[]> = new Map();

  if (knownSpec) {
    expectedPositions = knownSpec.variables.map((v) => v.position).sort((a, b) => a - b);
    knownSpec.variables.forEach((v) => {
      allowedAliases.set(v.position, [
        String(v.position),
        `{{${v.position}}}`,
        v.key,
        v.canonicalKey.toLowerCase(),
        ...v.aliases.map((a) => a.toLowerCase()),
      ]);
    });
  } else if (template.variables && Array.isArray(template.variables) && template.variables.length > 0) {
    expectedPositions = template.variables.map((v) => v.index).sort((a, b) => a - b);
    template.variables.forEach((v) => {
      allowedAliases.set(
        v.index,
        [
          String(v.index),
          `{{${v.index}}}`,
          v.key,
          v.suggestedMapping ? v.suggestedMapping.toLowerCase() : "",
        ].filter(Boolean)
      );
    });
  } else if (Array.isArray((template as any).components) || Array.isArray(template.rawComponents)) {
    // If raw components exist (e.g. from Meta API or fixtures), extract positional variables
    const components = (template as any).components || template.rawComponents || [];
    const extractedIndices = new Set<number>();
    for (const comp of components) {
      if (comp.text) {
        const matches = (comp.text as string).matchAll(/\{\{(\d+)\}\}/g);
        for (const m of matches) {
          extractedIndices.add(parseInt(m[1], 10));
        }
      }
    }
    expectedPositions = Array.from(extractedIndices).sort((a, b) => a - b);
    expectedPositions.forEach((pos) => {
      allowedAliases.set(pos, [String(pos), `{{${pos}}}`]);
    });
  } else if (typeof (template as any).variableCount === "number") {
    const count = (template as any).variableCount;
    for (let i = 1; i <= count; i++) {
      expectedPositions.push(i);
      allowedAliases.set(i, [String(i), `{{${i}}}`]);
    }
  } else if (template.variables && Array.isArray(template.variables) && template.variables.length === 0) {
    expectedPositions = [];
  } else {
    return {
      valid: false,
      error: `Template variable metadata for '${templateName}' is unavailable or cannot be trusted. Cannot safely dispatch.`,
      expectedPositions: [],
      variableCount: 0,
    };
  }

  const expectedCount = expectedPositions.length;

  // 2. Validate contiguous 1-based indexing of expected variables from template
  for (let i = 0; i < expectedCount; i++) {
    const expectedPos = i + 1;
    if (expectedPositions[i] !== expectedPos) {
      return {
        valid: false,
        error: `Meta template '${templateName}' defines non-contiguous variable positions [${expectedPositions.join(
          ", "
        )}]. Template positions must be contiguous starting from {{1}}.`,
        expectedPositions,
        variableCount: expectedCount,
      };
    }
  }

  // 3. Handle zero-variable templates (e.g. hello_world)
  const populatedKeys = Object.keys(rawMapping).filter(
    (k) => rawMapping[k] !== undefined && rawMapping[k] !== null && String(rawMapping[k]).trim() !== ""
  );

  if (expectedCount === 0) {
    if (populatedKeys.length > 0) {
      return {
        valid: false,
        error: `Template '${templateName}' does not accept any parameters (expected 0, but received mappings for: [${populatedKeys.join(
          ", "
        )}]).`,
        expectedPositions,
        variableCount: 0,
      };
    }
    return { valid: true, expectedPositions, variableCount: 0 };
  }

  // 4. Validate that each expected position is mapped with a non-empty value
  for (const pos of expectedPositions) {
    const aliases = allowedAliases.get(pos) || [String(pos), `{{${pos}}}`];
    const hasMapping = Object.keys(rawMapping).some((k) => {
      const kNorm = k.trim().toLowerCase();
      return (
        aliases.includes(kNorm) &&
        rawMapping[k] !== undefined &&
        rawMapping[k] !== null &&
        String(rawMapping[k]).trim() !== ""
      );
    });

    if (!hasMapping) {
      return {
        valid: false,
        error: `Missing required template parameter for position {{${pos}}} in template '${templateName}'.`,
        expectedPositions,
        variableCount: expectedCount,
      };
    }
  }

  // 5. Check for extra, unrecognized, or ambiguous parameter mappings
  for (const key of Object.keys(rawMapping)) {
    const val = rawMapping[key];
    if (val === undefined || val === null || String(val).trim() === "") continue;

    const keyNorm = key.trim().toLowerCase();
    let matchesPosition = false;

    for (const [, aliases] of allowedAliases.entries()) {
      if (aliases.includes(keyNorm)) {
        matchesPosition = true;
        break;
      }
    }

    if (!matchesPosition) {
      return {
        valid: false,
        error: `Unexpected extra or unrecognized parameter mapping '${key}' for template '${templateName}' which expects ${expectedCount} parameter(s) (positions: [${expectedPositions.join(
          ", "
        )}]).`,
        expectedPositions,
        variableCount: expectedCount,
      };
    }

    // 6. Validate placeholder value syntax
    const valStr = String(val).trim();
    if (valStr.includes("{{") || valStr.includes("}}")) {
      const match = valStr.match(/^\{\{([a-zA-Z0-9_\.]+)\}\}$/);
      if (!match) {
        return {
          valid: false,
          error: `Malformed dynamic variable placeholder '${valStr}' for parameter '${key}'. Must follow the format {{attributeName}} (e.g. {{firstName}}).`,
          expectedPositions,
          variableCount: expectedCount,
        };
      }
    }
  }

  return {
    valid: true,
    expectedPositions,
    variableCount: expectedCount,
  };
}


