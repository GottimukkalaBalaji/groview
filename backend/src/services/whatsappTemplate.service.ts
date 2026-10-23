import { logger } from "../utils/logger.js";
import { AppError } from "../utils/errors.js";
import {
  RawMetaTemplate,
  MetaTemplateComponent,
  NormalizedWhatsAppTemplate,
  MetaTemplateStatus,
  TemplateVariableSpec,
  TemplateSyncSummary,
} from "../types/template.js";
import {
  KNOWN_TEMPLATE_METADATA,
  resolvePositionalTemplateParameters,
} from "./templateParameterMapping.js";
import { MetaConfigResolver, ResolvedMetaConfig } from "./metaConfigResolver.js";
import { CreateTemplateInput } from "../validators/template.validator.js";
import { addAllowedTestTemplate } from "../constants/templateAllowlist.js";

interface CacheEntry {
  templates: NormalizedWhatsAppTemplate[];
  rawTemplates: RawMetaTemplate[];
  summary: TemplateSyncSummary;
  expiresAt: number;
}

export class WhatsAppTemplateService {
  private cacheByOrg: Map<string, CacheEntry> = new Map();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes in-memory cache

  /**
   * Derives human-friendly variable labels and suggestions based on template name and variable key
   */
  private deriveVariableSpec(
    templateName: string,
    key: string,
    component: "HEADER" | "BODY",
    exampleValue?: string
  ): TemplateVariableSpec {
    const index = parseInt(key, 10);
    const knownSpec = KNOWN_TEMPLATE_METADATA[templateName];
    const knownVar = knownSpec?.variables.find((v) => v.key === key || v.position === index);

    if (knownVar) {
      return {
        key,
        index: isNaN(index) ? knownVar.position : index,
        component,
        label: knownVar.label,
        suggestedMapping: knownVar.canonicalKey,
        exampleValue: exampleValue || knownVar.exampleValue,
        required: knownVar.required,
      };
    }

    return {
      key,
      index: isNaN(index) ? 1 : index,
      component,
      label: `Variable {{${key}}}`,
      suggestedMapping: key === "1" ? "firstName" : undefined,
      exampleValue,
      required: true,
    };
  }

  /**
   * Extracts variable placeholders (e.g. {{1}}, {{2}}) from text components
   */
  private extractVariables(
    templateName: string,
    components: MetaTemplateComponent[]
  ): TemplateVariableSpec[] {
    const specs: TemplateVariableSpec[] = [];
    const seen = new Set<string>();

    for (const comp of components) {
      if ((comp.type === "HEADER" && comp.format === "TEXT") || comp.type === "BODY") {
        const text = comp.text || "";
        const matches = text.matchAll(/\{\{(\d+)\}\}/g);
        for (const match of matches) {
          const varKey = match[1];
          const uniqueKey = `${comp.type}_${varKey}`;
          if (!seen.has(uniqueKey)) {
            seen.add(uniqueKey);
            let exampleVal: string | undefined;
            if (comp.type === "BODY" && comp.example?.body_text?.[0]) {
              const idx = parseInt(varKey, 10) - 1;
              exampleVal = comp.example.body_text[0][idx];
            } else if (comp.type === "HEADER" && comp.example?.header_text) {
              const idx = parseInt(varKey, 10) - 1;
              exampleVal = comp.example.header_text[idx];
            }
            specs.push(this.deriveVariableSpec(templateName, varKey, comp.type, exampleVal));
          }
        }
      }
    }

    // Sort positional variables numerically
    return specs.sort((a, b) => a.index - b.index);
  }

  /**
   * Normalizes raw Meta template JSON into Grovastra's standard template contract
   */
  public normalizeTemplate(raw: RawMetaTemplate): NormalizedWhatsAppTemplate {
    const headerComp = raw.components.find((c) => c.type === "HEADER");
    const bodyComp = raw.components.find((c) => c.type === "BODY");
    const footerComp = raw.components.find((c) => c.type === "FOOTER");
    const buttonsComp = raw.components.find((c) => c.type === "BUTTONS");

    let header: NormalizedWhatsAppTemplate["header"] = undefined;
    if (headerComp) {
      header = {
        format: headerComp.format || "TEXT",
        text: headerComp.text,
      };
    }

    const buttons =
      buttonsComp?.buttons?.map((b) => ({
        type: b.type,
        text: b.text,
        url: b.url,
        phoneNumber: b.phone_number,
      })) || [];

    const variables = this.extractVariables(raw.name, raw.components);

    return {
      id: raw.id,
      name: raw.name,
      language: raw.language,
      category: raw.category,
      status: raw.status,
      isSendable: raw.status === "APPROVED",
      parameterFormat: raw.parameter_format || "POSITIONAL",
      header,
      body: bodyComp?.text || "",
      footer: footerComp?.text,
      buttons,
      variables,
      rawComponents: raw.components,
    };
  }

  /**
   * Fetches all message templates from Meta Cloud API with pagination support,
   * scoped to the requesting organization.
   */
  public async fetchWabaTemplates(
    orgIdOrForce: string | boolean = false,
    forceRefresh = false
  ): Promise<{ templates: NormalizedWhatsAppTemplate[]; summary: TemplateSyncSummary }> {
    let organizationId: string;
    let force: boolean;

    if (typeof orgIdOrForce === "boolean") {
      force = orgIdOrForce;
      organizationId = process.env.META_ORGANIZATION_ID || "";
    } else {
      organizationId = typeof orgIdOrForce === "string" ? orgIdOrForce.trim() : "";
      force = forceRefresh;
    }

    if (!organizationId) {
      throw new AppError(
        "A valid organizationId is required to fetch templates",
        400,
        "INVALID_ORGANIZATION_ID"
      );
    }

    const cached = this.cacheByOrg.get(organizationId);
    // Return cached templates if valid and refresh not explicitly requested
    if (!force && cached && Date.now() < cached.expiresAt) {
      return {
        templates: cached.templates,
        summary: cached.summary,
      };
    }

    let metaConfig: ResolvedMetaConfig;
    try {
      metaConfig = await MetaConfigResolver.resolveOutboundConfig(organizationId);
    } catch (err: unknown) {
      this.cacheByOrg.delete(organizationId); // Clear cache for this org on config failure so stale cached data cannot be served
      if (err instanceof AppError) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : "Meta configuration missing";
      logger.error(`[WhatsAppTemplateService] Meta credentials unconfigured for organization ${organizationId}: ${msg}`);
      throw new AppError(
        "WhatsApp Cloud API is not configured. Please check backend environment settings or connect in Settings.",
        503,
        "META_CONFIG_UNAVAILABLE"
      );
    }

    const { accessToken, wabaId, graphApiVersion } = metaConfig;
    const version = graphApiVersion || "v22.0";
    const maskedWabaId = wabaId.length > 4 ? `***${wabaId.slice(-4)}` : "***";

    let url: string | null = `https://graph.facebook.com/${version}/${wabaId}/message_templates?limit=100`;
    const rawTemplates: RawMetaTemplate[] = [];

    logger.info(
      `[WhatsAppTemplateService] Synchronizing templates from Meta WABA for organization ${organizationId} (ID: ${maskedWabaId}, Graph API: ${version})`
    );

    while (url) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10s network timeout

      try {
        const response = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
          },
          signal: controller.signal,
        });

        clearTimeout(timeout);

        const data = (await response.json()) as {
          data?: RawMetaTemplate[];
          paging?: { next?: string };
          error?: {
            message?: string;
            code?: number;
            error_subcode?: number;
            type?: string;
          };
        };

        if (!response.ok) {
          const errCode = data.error?.code;
          const subCode = data.error?.error_subcode;
          const errMsg = data.error?.message || `HTTP ${response.status} from Meta Graph API`;

          logger.error(
            `[WhatsAppTemplateService] Meta Cloud API error [Code: ${errCode}, Subcode: ${subCode}]: ${errMsg}`
          );

          if (errCode === 190) {
            throw new AppError(
              "Meta WhatsApp access token has expired or is invalid. Please refresh META_WHATSAPP_ACCESS_TOKEN in backend/.env or your WhatsApp connection in Settings.",
              401,
              "META_AUTH_EXPIRED"
            );
          }

          throw new AppError(
            `Meta Cloud API request failed: ${errMsg}`,
            502,
            "META_API_ERROR"
          );
        }

        if (Array.isArray(data.data)) {
          rawTemplates.push(...data.data);
        }

        url = data.paging?.next || null;
      } catch (err: unknown) {
        clearTimeout(timeout);
        this.cacheByOrg.delete(organizationId); // Clear cache on network/API failure so stale cached data cannot be served
        if (err instanceof AppError) throw err;
        if (err instanceof Error && err.name === "AbortError") {
          throw new AppError(
            "Meta Cloud API request timed out after 10 seconds. Please try again.",
            504,
            "META_API_TIMEOUT"
          );
        }
        const message = err instanceof Error ? err.message : "Unknown network error";
        logger.error(`[WhatsAppTemplateService] Network error connecting to Meta: ${message}`);
        throw new AppError(
          `Unable to connect to WhatsApp Cloud API: ${message}`,
          502,
          "META_NETWORK_ERROR"
        );
      }
    }

    const normalized = rawTemplates.map((t) => this.normalizeTemplate(t));

    const approvedCount = normalized.filter((t) => t.status === "APPROVED").length;
    const pendingCount = normalized.filter((t) => t.status === "PENDING").length;
    const rejectedCount = normalized.filter((t) => t.status === "REJECTED").length;

    const summary: TemplateSyncSummary = {
      totalOnMeta: normalized.length,
      approvedCount,
      pendingCount,
      rejectedCount,
      wabaIdMasked: maskedWabaId,
      syncedAt: new Date().toISOString(),
      requestedTemplatesFound: {
        hello_world: normalized.some((t) => t.name === "hello_world"),
        jaspers_market_plain_text_v1: normalized.some(
          (t) => t.name === "jaspers_market_plain_text_v1"
        ),
        jaspers_market_order_confirmation_v1: normalized.some(
          (t) => t.name === "jaspers_market_order_confirmation_v1"
        ),
      },
    };

    // Update in-memory cache partitioned by organizationId
    this.cacheByOrg.set(organizationId, {
      templates: normalized,
      rawTemplates,
      summary,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    });

    logger.info(
      `[WhatsAppTemplateService] Synced ${normalized.length} templates for organization ${organizationId} (Approved: ${approvedCount}, Pending: ${pendingCount})`
    );

    return { templates: normalized, summary };
  }

  /**
   * Submits a custom WhatsApp message template to Meta WhatsApp Cloud API for review.
   *
   * @param organizationId - Trusted tenant organization ID
   * @param payload - Validated template specification (name, category, language, components)
   */
  public async createTemplate(
    organizationId: string,
    payload: CreateTemplateInput
  ): Promise<{
    id: string;
    name: string;
    status: string;
    category: string;
    language: string;
  }> {
    const org = (organizationId || "").trim();
    if (!org) {
      throw new AppError(
        "A valid organizationId is required to create a template",
        400,
        "INVALID_ORGANIZATION_ID"
      );
    }

    let metaConfig: ResolvedMetaConfig;
    try {
      metaConfig = await MetaConfigResolver.resolveOutboundConfig(org);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      const msg = err instanceof Error ? err.message : "Meta configuration missing";
      logger.error(`[WhatsAppTemplateService] Meta credentials unconfigured for organization ${org}: ${msg}`);
      throw new AppError(
        "WhatsApp Cloud API is not configured. Please check backend environment settings or connect in Settings.",
        503,
        "META_CONFIG_UNAVAILABLE"
      );
    }

    const { accessToken, wabaId, graphApiVersion } = metaConfig;
    const version = graphApiVersion || "v22.0";
    const maskedWabaId = wabaId.length > 4 ? `***${wabaId.slice(-4)}` : "***";

    logger.info(
      `[WhatsAppTemplateService] Submitting template "${payload.name}" to Meta WABA (ID: ${maskedWabaId}, Graph API: ${version}) for organization ${org}`
    );

    const url = `https://graph.facebook.com/${version}/${wabaId}/message_templates`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s network timeout

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          name: payload.name,
          category: payload.category,
          language: payload.language,
          components: payload.components,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const data = (await response.json()) as {
        id?: string;
        status?: string;
        category?: string;
        error?: {
          message?: string;
          code?: number;
          error_subcode?: number;
          type?: string;
        };
      };

      if (!response.ok) {
        const errCode = data.error?.code;
        const subCode = data.error?.error_subcode;
        const rawErrMsg = data.error?.message || `HTTP ${response.status} from Meta Graph API`;
        const sanitizedErrMsg = rawErrMsg
          .replace(/EAA[a-zA-Z0-9._-]+/g, "[REDACTED_TOKEN]")
          .replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, "Bearer [REDACTED]");

        logger.error(
          `[WhatsAppTemplateService] Meta template submission failed [Code: ${errCode}, Subcode: ${subCode}]: ${sanitizedErrMsg}`
        );

        if (errCode === 190) {
          throw new AppError(
            "Meta WhatsApp access token has expired or is invalid. Please refresh META_WHATSAPP_ACCESS_TOKEN in backend/.env or your WhatsApp connection in Settings.",
            401,
            "META_AUTH_EXPIRED"
          );
        }

        if (
          subCode === 2388042 ||
          (errCode === 100 && (sanitizedErrMsg.toLowerCase().includes("already exists") || sanitizedErrMsg.toLowerCase().includes("duplicate")))
        ) {
          throw new AppError(
            `A template with the name "${payload.name}" already exists in language "${payload.language}" on this Meta WhatsApp Business Account. Please use a unique template name.`,
            409,
            "TEMPLATE_NAME_EXISTS"
          );
        }

        if (errCode === 200 || errCode === 10 || sanitizedErrMsg.toLowerCase().includes("permission")) {
          throw new AppError(
            "Insufficient Meta permissions to create message templates. Ensure your access token has the whatsapp_business_management permission.",
            403,
            "META_PERMISSION_DENIED"
          );
        }

        if (errCode === 4 || errCode === 80007) {
          throw new AppError(
            "Meta API rate limit reached. Please wait a few moments before submitting again.",
            429,
            "META_RATE_LIMITED"
          );
        }

        throw new AppError(
          `Meta rejected template submission: ${sanitizedErrMsg}`,
          502,
          "META_API_ERROR"
        );
      }

      const templateId = String(data.id || "").trim();
      const status = String(data.status || "PENDING").trim();

      logger.info(
        `[WhatsAppTemplateService] Template "${payload.name}" successfully created at Meta (ID: ${templateId}, Status: ${status}) for organization ${org}`
      );

      // Invalidate target organization cache so subsequent reads refresh from Meta
      this.invalidateCache(org);

      // Dynamically add to allowlist so it is not filtered out during testing
      addAllowedTestTemplate(payload.name);

      return {
        id: templateId,
        name: payload.name,
        status,
        category: data.category || payload.category,
        language: payload.language,
      };
    } catch (err: unknown) {
      clearTimeout(timeout);
      if (err instanceof AppError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new AppError(
          "Meta Cloud API request timed out after 10 seconds. Do not retry immediately as the template may have already reached Meta.",
          504,
          "META_API_TIMEOUT"
        );
      }
      const message = err instanceof Error ? err.message : "Unknown network error";
      logger.error(`[WhatsAppTemplateService] Network error submitting template to Meta: ${message}`);
      throw new AppError(
        `Unable to connect to WhatsApp Cloud API: ${message}`,
        502,
        "META_NETWORK_ERROR"
      );
    }
  }


  /**
   * Retrieves a single template by name for a specific organization
   */
  public async getTemplateByName(
    name: string,
    organizationId?: string
  ): Promise<NormalizedWhatsAppTemplate | null> {
    const org = (organizationId || process.env.META_ORGANIZATION_ID || "").trim();
    if (!org) {
      throw new AppError(
        "A valid organizationId is required to retrieve template",
        400,
        "INVALID_ORGANIZATION_ID"
      );
    }
    const { templates } = await this.fetchWabaTemplates(org);
    return templates.find((t) => t.name === name) || null;
  }

  /**
   * Validates parameter mappings against a template's required variables
   */
  public validateTemplateVariables(
    template: NormalizedWhatsAppTemplate,
    variables: Record<string, string> = {}
  ): { isValid: boolean; errors: Record<string, string> } {
    const errors: Record<string, string> = {};

    if (!template.isSendable) {
      errors["_template"] = `Template "${template.name}" is ${template.status} on Meta and cannot be sent.`;
    }

    try {
      resolvePositionalTemplateParameters(template.name, variables);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid template parameters";
      errors["_parameters"] = msg;
    }

    for (const v of template.variables) {
      const val = variables[v.key] ?? (v.suggestedMapping ? variables[v.suggestedMapping] : undefined);
      if (!val || typeof val !== "string" || val.trim().length === 0) {
        errors[v.key] = `Parameter {{${v.key}}} (${v.label}) is required.`;
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
    };
  }

  /**
   * Safely invalidates the template cache for a specific organization or all organizations.
   * Ensures subsequent reads cannot use stale approval or sendability data.
   */
  public invalidateCache(organizationId?: string): void {
    if (organizationId) {
      this.cacheByOrg.delete(organizationId);
      logger.info(`[WhatsAppTemplateService] In-memory template cache invalidated for organization ${organizationId}`);
    } else {
      this.cacheByOrg.clear();
      logger.info("[WhatsAppTemplateService] In-memory template cache invalidated for all organizations");
    }
  }

  /**
   * Applies an incoming template status update to the active cache for a specific organization (if populated)
   * and marks that organization's cache expired so a full re-sync is scheduled on the next read.
   * Uses safe string comparison for metaTemplateId to prevent precision loss.
   */
  public applyTemplateStatusUpdate(
    metaTemplateId: string | number,
    event: string,
    organizationId?: string
  ): { applied: boolean; wasSendable: boolean; isSendable: boolean } {
    const idStr = String(metaTemplateId).trim();
    const normalizedEvent = typeof event === "string" ? event.toUpperCase().trim() : "UNKNOWN";
    const sendable = isTemplateEventSendable(normalizedEvent);

    const targetOrg = (organizationId || process.env.META_ORGANIZATION_ID || "").trim();
    if (!targetOrg) {
      return { applied: false, wasSendable: false, isSendable: sendable };
    }
    const orgCache = this.cacheByOrg.get(targetOrg);

    if (!orgCache) {
      return { applied: false, wasSendable: false, isSendable: sendable };
    }

    const template = orgCache.templates.find((t) => String(t.id).trim() === idStr);
    if (!template) {
      // Invalidate target organization cache so any newly approved template is pulled on next read
      this.invalidateCache(targetOrg);
      return { applied: false, wasSendable: false, isSendable: sendable };
    }

    const wasSendable = template.isSendable;
    template.status = normalizedEvent as MetaTemplateStatus;
    template.isSendable = sendable;

    // Mark expired so next read refreshes from Meta, while current in-memory status fails closed
    orgCache.expiresAt = 0;

    logger.info(
      `[WhatsAppTemplateService] Updated template ${template.name} (${idStr}) status to ${normalizedEvent} for organization ${targetOrg} (sendable: ${sendable})`
    );

    return { applied: true, wasSendable, isSendable: sendable };
  }

  /**
   * Clears in-memory cache for a specific organization or all organizations (useful for testing)
   */
  public clearCache(organizationId?: string): void {
    if (organizationId) {
      this.cacheByOrg.delete(organizationId);
    } else {
      this.cacheByOrg.clear();
    }
  }

  /**
   * Directly sets internal cache for a specific organization (useful for testing)
   */
  public setCacheForTesting(entry: CacheEntry | null, organizationId?: string): void {
    const org = organizationId || process.env.META_ORGANIZATION_ID || "test_default";
    if (entry === null) {
      this.cacheByOrg.delete(org);
    } else {
      this.cacheByOrg.set(org, entry);
    }
  }

  /**
   * Inspects current cache state for a specific organization (useful for testing)
   */
  public getCacheForTesting(organizationId?: string): CacheEntry | null {
    const org = organizationId || process.env.META_ORGANIZATION_ID || "test_default";
    return this.cacheByOrg.get(org) || null;
  }

  /**
   * Returns current number of distinct organizations with cached templates (useful for testing)
   */
  public getCacheSizeForTesting(): number {
    return this.cacheByOrg.size;
  }
}

/**
 * Maps a Meta template status event to sendability.
 * Fail-closed: only "APPROVED" is sendable. Any other or unknown event returns false.
 */
export function isTemplateEventSendable(event: string): boolean {
  return typeof event === "string" && event.toUpperCase().trim() === "APPROVED";
}

export const whatsappTemplateService = new WhatsAppTemplateService();

