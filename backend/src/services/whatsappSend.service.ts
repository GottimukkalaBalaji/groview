import { MessageDeliveryStatus, ConsentStatus, Prisma } from "@prisma/client";
import { getPrismaClient } from "../config/prisma.js";
import { validateMetaConfig } from "../config/env.js";
import { BadRequestError, ConflictError } from "../utils/errors.js";
import {
  buildMetaTemplateComponents,
  normalizeTemplateParameters,
} from "./templateParameterMapping.js";

export interface SendTemplateInput {
  organizationId: string;
  recipientPhone: string;
  templateName: string;
  templateLanguage?: string;
  parameters?: Record<string, unknown>;
  campaignId?: string;
  contactId?: string;
  clientRequestId?: string;
}

export type DispatchOutcome =
  | { outcome: "SUCCESS"; wamid: string }
  | { outcome: "AMBIGUOUS_TIMEOUT"; errorCode: string; errorMessage: string }
  | { outcome: "TERMINAL_ERROR"; errorCode: string; errorMessage: string };

export class WhatsAppSendService {
  /**
   * Performs all pre-flight tenant, consent, suppression, and campaign state validations.
   */
  public static async validatePreflight(input: {
    organizationId: string;
    recipientPhone: string;
    campaignId?: string | null;
    contactId?: string | null;
  }): Promise<{
    valid: boolean;
    rejectReason?: string;
    errorCode?: string;
  }> {
    const prisma = getPrismaClient();

    // 1. Verify organization exists and is active (not archived or soft-deleted)
    const organization = await prisma.organization.findUnique({
      where: { id: input.organizationId },
    });

    if (!organization || organization.isArchived || organization.deletedAt !== null) {
      return {
        valid: false,
        rejectReason: "Organization is archived, deleted, or does not exist",
        errorCode: "ORGANIZATION_INACTIVE",
      };
    }

    // 2. Validate campaign state if campaignId provided
    if (input.campaignId) {
      const campaign = await prisma.campaign.findFirst({
        where: {
          id: input.campaignId,
          organizationId: input.organizationId,
        },
      });

      if (!campaign) {
        return {
          valid: false,
          rejectReason: "Campaign does not exist or does not belong to this organization",
          errorCode: "CAMPAIGN_NOT_FOUND",
        };
      }

      if (campaign.status === "COMPLETED" || campaign.status === "CANCELLED") {
        return {
          valid: false,
          rejectReason: `Cannot dispatch for campaign in status ${campaign.status}`,
          errorCode: "CAMPAIGN_STATUS_INVALID",
        };
      }
    }

    // 3. Validate contact consent and suppression if contactId provided
    if (input.contactId) {
      const contact = await prisma.contact.findFirst({
        where: {
          id: input.contactId,
          organizationId: input.organizationId,
        },
      });

      if (!contact) {
        return {
          valid: false,
          rejectReason: "Contact does not exist or does not belong to this organization",
          errorCode: "CONTACT_NOT_FOUND",
        };
      }

      if (contact.isSuppressed) {
        return {
          valid: false,
          rejectReason: `Recipient is suppressed: ${contact.suppressionReason || "Manual suppression"}`,
          errorCode: "RECIPIENT_SUPPRESSED",
        };
      }

      if (contact.consentStatus !== ConsentStatus.OPTED_IN) {
        return {
          valid: false,
          rejectReason: `Recipient consent is ${contact.consentStatus}, must be OPTED_IN to dispatch`,
          errorCode: "CONSENT_REQUIRED",
        };
      }
    }

    return { valid: true };
  }

  /**
   * Executes Meta Cloud API HTTP dispatch with 10s fetch timeout and safe error classification.
   * Never throws uncaught exceptions; returns explicit DispatchOutcome.
   */
  public static async executeMetaSend(params: {
    recipientPhone: string;
    templateName: string;
    templateLanguage: string;
    parameters: Record<string, unknown>;
    metaConfigOverride?: {
      accessToken: string;
      phoneNumberId: string;
      graphApiVersion: string;
      fetchFn?: typeof fetch;
    };
  }): Promise<DispatchOutcome> {
    const config = params.metaConfigOverride || validateMetaConfig();
    const fetchImpl = params.metaConfigOverride?.fetchFn || globalThis.fetch;

    const cleanPhone = params.recipientPhone.replace(/\D/g, "");
    const url = `https://graph.facebook.com/${config.graphApiVersion}/${config.phoneNumberId}/messages`;

    // Construct Meta Cloud API payload with strictly-ordered positional components
    const components = buildMetaTemplateComponents(
      params.templateName,
      params.parameters
    );

    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: cleanPhone,
      type: "template",
      template: {
        name: params.templateName,
        language: {
          code: params.templateLanguage || "en_US",
        },
        components,
      },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // Strict 10-second timeout

    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      interface MetaApiResponse {
        messaging_product?: string;
        contacts?: Array<{ input: string; wa_id: string }>;
        messages?: Array<{ id: string }>;
        error?: {
          message?: string;
          type?: string;
          code?: number;
          error_subcode?: number;
        };
      }

      const responseBody = (await response.json().catch(() => ({}))) as MetaApiResponse;

      // HTTP 200 OK -> Meta Accepted Message
      if (response.ok && responseBody?.messages?.[0]?.id) {
        return {
          outcome: "SUCCESS",
          wamid: responseBody.messages[0].id,
        };
      }

      // Check HTTP 5xx or Ambiguous Gateway Responses
      if (response.status >= 500) {
        return {
          outcome: "AMBIGUOUS_TIMEOUT",
          errorCode: `HTTP_${response.status}`,
          errorMessage: `Meta returned server error: ${JSON.stringify(responseBody?.error?.message || "Unknown 5xx")}`,
        };
      }

      // Terminal 4xx Client Errors (Bad template, invalid recipient, unapproved params)
      const errorDetail = responseBody?.error;
      return {
        outcome: "TERMINAL_ERROR",
        errorCode: errorDetail?.code ? `META_${errorDetail.code}` : `HTTP_${response.status}`,
        errorMessage: errorDetail?.message || "Meta API client error",
      };
    } catch (err: unknown) {
      clearTimeout(timeout);

      const isAbort = (err as Error)?.name === "AbortError";
      const isNetworkTimeout =
        (err as Error)?.message?.includes("ETIMEDOUT") ||
        (err as Error)?.message?.includes("ECONNRESET");

      if (isAbort || isNetworkTimeout) {
        return {
          outcome: "AMBIGUOUS_TIMEOUT",
          errorCode: "TIMEOUT",
          errorMessage: "Network request timed out after 10s while awaiting Meta response",
        };
      }

      return {
        outcome: "AMBIGUOUS_TIMEOUT",
        errorCode: "NETWORK_ERROR",
        errorMessage: (err as Error)?.message || "Network error communicating with Meta API",
      };
    }
  }

  /**
   * Creates or looks up an ad-hoc WhatsApp message with stable clientRequestId idempotency.
   * Rejects reuse with a different payload by throwing ConflictError.
   */
  public static async createOrGetAdHocMessage(input: {
    organizationId: string;
    clientRequestId: string;
    recipientPhone: string;
    templateName: string;
    templateLanguage?: string;
    parameters?: Record<string, unknown>;
  }): Promise<{
    message: {
      id: string;
      organizationId: string;
      status: MessageDeliveryStatus;
      clientRequestId: string | null;
      recipientPhone: string;
      templateName: string;
      wamid: string | null;
    };
    isExisting: boolean;
  }> {
    const prisma = getPrismaClient();
    const language = input.templateLanguage || "en_US";
    let params: Record<string, unknown> = input.parameters || {};
    try {
      params = normalizeTemplateParameters(input.templateName, params);
    } catch {
      // Fallback to raw parameters if not normalizable
    }

    // 1. Check existing record
    const existing = await prisma.whatsAppMessage.findUnique({
      where: {
        organizationId_clientRequestId: {
          organizationId: input.organizationId,
          clientRequestId: input.clientRequestId,
        },
      },
    });

    if (existing) {
      // Compare payloads
      const existingParams = existing.parameters as Record<string, unknown>;
      const existingParamsJson = JSON.stringify(existingParams || {});
      const newParamsJson = JSON.stringify(params);

      const phoneMatches = existing.recipientPhone === input.recipientPhone;
      const templateMatches = existing.templateName === input.templateName;
      const languageMatches = existing.templateLanguage === language;
      const paramsMatch = existingParamsJson === newParamsJson;

      if (!phoneMatches || !templateMatches || !languageMatches || !paramsMatch) {
        throw new ConflictError(
          `clientRequestId '${input.clientRequestId}' was previously used with a different dispatch payload.`
        );
      }

      return {
        message: existing,
        isExisting: true,
      };
    }

    // 2. Validate preflight
    const preflight = await WhatsAppSendService.validatePreflight({
      organizationId: input.organizationId,
      recipientPhone: input.recipientPhone,
    });

    if (!preflight.valid) {
      throw new BadRequestError(preflight.rejectReason || "Preflight validation failed");
    }

    // 3. Create new message record
    const created = await prisma.whatsAppMessage.create({
      data: {
        organizationId: input.organizationId,
        clientRequestId: input.clientRequestId,
        recipientPhone: input.recipientPhone,
        templateName: input.templateName,
        templateLanguage: language,
        parameters: params as Prisma.InputJsonValue,
        status: MessageDeliveryStatus.QUEUED,
      },
    });

    return {
      message: created,
      isExisting: false,
    };
  }
}
