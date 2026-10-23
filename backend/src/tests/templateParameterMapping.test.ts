import { describe, it, expect, vi } from "vitest";
import {
  resolvePositionalTemplateParameters,
  buildMetaTemplateComponents,
  normalizeTemplateParameters,
  resolveContactTemplateParameters,
  validateCampaignTemplateMapping,
} from "../services/templateParameterMapping.js";
import { WhatsAppSendService } from "../services/whatsappSend.service.js";

describe("Phase 5D — Template Positional Parameter Mapping & Order Verification", () => {
  describe("hello_world template", () => {
    it("proves hello_world always sends zero body parameters (empty components array)", () => {
      // 1. With empty object
      const params1 = resolvePositionalTemplateParameters("hello_world", {});
      expect(params1).toEqual([]);
      expect(buildMetaTemplateComponents("hello_world", {})).toEqual([]);

      // 2. With undefined
      const params2 = resolvePositionalTemplateParameters("hello_world", undefined);
      expect(params2).toEqual([]);
      expect(buildMetaTemplateComponents("hello_world", undefined)).toEqual([]);

      // 3. Even if unexpected arbitrary keys are passed, zero body parameters are sent
      const params3 = resolvePositionalTemplateParameters("hello_world", {
        unexpectedKey: "some_value",
      });
      expect(params3).toEqual([]);
      expect(buildMetaTemplateComponents("hello_world", { unexpectedKey: "some_value" })).toEqual([]);
    });

    it("verifies outgoing Meta Cloud API payload for hello_world contains empty components array", async () => {
      let interceptedPayload: any = null;

      const mockFetch = vi.fn().mockImplementation(async (_url, options) => {
        interceptedPayload = JSON.parse(options.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            messaging_product: "whatsapp",
            contacts: [{ input: "919876543210", wa_id: "919876543210" }],
            messages: [{ id: "wamid.TEST_HELLO_WORLD" }],
          }),
        };
      });

      const result = await WhatsAppSendService.executeMetaSend({
        recipientPhone: "+919876543210",
        templateName: "hello_world",
        templateLanguage: "en_US",
        parameters: {},
        metaConfigOverride: {
          accessToken: "mock_token",
          phoneNumberId: "mock_phone_id",
          graphApiVersion: "v22.0",
          fetchFn: mockFetch as unknown as typeof fetch,
        },
      });

      expect(result.outcome).toBe("SUCCESS");
      expect(interceptedPayload).not.toBeNull();
      expect(interceptedPayload.template.name).toBe("hello_world");
      expect(interceptedPayload.template.components).toEqual([]);
    });
  });

  describe("jaspers_market_order_confirmation_v1 template", () => {
    const expectedName = "Alice Wonderland";
    const expectedOrderNumber = "ORD-2026-99881";
    const expectedDelivery = "Friday, October 24th";

    it("strictly preserves approved parameter order ({{1}}=Name, {{2}}=Order, {{3}}=Delivery) when numeric keys are reversed (3, 2, 1)", () => {
      // Keys deliberately passed in reverse order: "3", then "2", then "1"
      const reversedParams = {
        "3": expectedDelivery,
        "2": expectedOrderNumber,
        "1": expectedName,
      };

      const resolved = resolvePositionalTemplateParameters(
        "jaspers_market_order_confirmation_v1",
        reversedParams
      );

      expect(resolved).toHaveLength(3);
      expect(resolved[0]).toEqual({ type: "text", text: expectedName });
      expect(resolved[1]).toEqual({ type: "text", text: expectedOrderNumber });
      expect(resolved[2]).toEqual({ type: "text", text: expectedDelivery });

      const components = buildMetaTemplateComponents(
        "jaspers_market_order_confirmation_v1",
        reversedParams
      );
      expect(components).toEqual([
        {
          type: "body",
          parameters: [
            { type: "text", text: expectedName },
            { type: "text", text: expectedOrderNumber },
            { type: "text", text: expectedDelivery },
          ],
        },
      ]);
    });

    it("strictly maps braced placeholders in random order ({{2}}, {{3}}, {{1}})", () => {
      const bracedScrambled = {
        "{{2}}": expectedOrderNumber,
        "{{3}}": expectedDelivery,
        "{{1}}": expectedName,
      };

      const resolved = resolvePositionalTemplateParameters(
        "jaspers_market_order_confirmation_v1",
        bracedScrambled
      );

      expect(resolved).toEqual([
        { type: "text", text: expectedName },
        { type: "text", text: expectedOrderNumber },
        { type: "text", text: expectedDelivery },
      ]);
    });

    it("strictly maps canonical named keys in arbitrary insertion order (deliveryDate, firstName, orderNumber)", () => {
      // JavaScript object where insertion order would otherwise place deliveryDate first!
      const namedParams = {
        deliveryDate: expectedDelivery,
        firstName: expectedName,
        orderNumber: expectedOrderNumber,
      };

      const resolved = resolvePositionalTemplateParameters(
        "jaspers_market_order_confirmation_v1",
        namedParams
      );

      expect(resolved).toEqual([
        { type: "text", text: expectedName },
        { type: "text", text: expectedOrderNumber },
        { type: "text", text: expectedDelivery },
      ]);
    });

    it("resolves accepted alias synonyms (customerName, orderId, estimatedDelivery)", () => {
      const aliasParams = {
        orderId: expectedOrderNumber,
        estimatedDelivery: expectedDelivery,
        customerName: expectedName,
      };

      const resolved = resolvePositionalTemplateParameters(
        "jaspers_market_order_confirmation_v1",
        aliasParams
      );

      expect(resolved).toEqual([
        { type: "text", text: expectedName },
        { type: "text", text: expectedOrderNumber },
        { type: "text", text: expectedDelivery },
      ]);
    });

    it("fails fast with explicit error when a required parameter position is missing", () => {
      // Missing position 2 (orderNumber)
      const incomplete = {
        "1": expectedName,
        "3": expectedDelivery,
      };

      expect(() =>
        resolvePositionalTemplateParameters("jaspers_market_order_confirmation_v1", incomplete)
      ).toThrow(
        /Missing required parameter for template "jaspers_market_order_confirmation_v1" at position \{\{2\}\}/
      );
    });

    it("verifies outgoing Meta Cloud API payload sends exactly 3 parameters in approved order regardless of input order", async () => {
      let interceptedPayload: any = null;

      const mockFetch = vi.fn().mockImplementation(async (_url, options) => {
        interceptedPayload = JSON.parse(options.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            messaging_product: "whatsapp",
            contacts: [{ input: "919876543210", wa_id: "919876543210" }],
            messages: [{ id: "wamid.TEST_ORDER_CONFIRMATION" }],
          }),
        };
      });

      // Pass out-of-order parameters
      const result = await WhatsAppSendService.executeMetaSend({
        recipientPhone: "+919876543210",
        templateName: "jaspers_market_order_confirmation_v1",
        templateLanguage: "en_US",
        parameters: {
          "3": expectedDelivery,
          "1": expectedName,
          "2": expectedOrderNumber,
        },
        metaConfigOverride: {
          accessToken: "mock_token",
          phoneNumberId: "mock_phone_id",
          graphApiVersion: "v22.0",
          fetchFn: mockFetch as unknown as typeof fetch,
        },
      });

      expect(result.outcome).toBe("SUCCESS");
      expect(interceptedPayload.template.name).toBe("jaspers_market_order_confirmation_v1");
      expect(interceptedPayload.template.components).toHaveLength(1);
      expect(interceptedPayload.template.components[0].type).toBe("body");

      const bodyParameters = interceptedPayload.template.components[0].parameters;
      expect(bodyParameters).toHaveLength(3);
      expect(bodyParameters[0]).toEqual({ type: "text", text: expectedName });
      expect(bodyParameters[1]).toEqual({ type: "text", text: expectedOrderNumber });
      expect(bodyParameters[2]).toEqual({ type: "text", text: expectedDelivery });
    });
  });

  describe("Ambiguous mapping and dynamic template safety", () => {
    it("orders dynamic numeric keys strictly by integer position", () => {
      const dynamicParams = {
        "{{4}}": "Four",
        "1": "One",
        "{{3}}": "Three",
        "2": "Two",
      };

      const resolved = resolvePositionalTemplateParameters("custom_unregistered_template", dynamicParams);

      expect(resolved).toEqual([
        { type: "text", text: "One" },
        { type: "text", text: "Two" },
        { type: "text", text: "Three" },
        { type: "text", text: "Four" },
      ]);
    });

    it("rejects ambiguous non-numeric keys for templates lacking explicit metadata without guessing", () => {
      const ambiguousParams = {
        promoCode: "SUMMER50",
        discountPercent: "20%",
      };

      expect(() =>
        resolvePositionalTemplateParameters("unregistered_mystery_template", ambiguousParams)
      ).toThrow(
        /Ambiguous template parameter mapping for template "unregistered_mystery_template"/
      );
    });

    it("normalizes template parameters into deterministic canonical numeric order", () => {
      const outOfOrder = {
        "3": "Third",
        "1": "First",
        "2": "Second",
      };

      const normalized = normalizeTemplateParameters(
        "jaspers_market_order_confirmation_v1",
        outOfOrder
      );

      expect(normalized).toEqual({
        "1": "First",
        "2": "Second",
        "3": "Third",
      });

      // Keys iterate in strictly 1, 2, 3 order
      expect(Object.keys(normalized)).toEqual(["1", "2", "3"]);
    });
  });

  describe("resolveContactTemplateParameters — First Name & Offer Code Resolution", () => {
    const validContact = {
      id: "cnt_test_001",
      firstName: "Balaji",
      lastName: "Gottimukkala",
      phoneNumber: "+919876543210",
      email: "balaji@example.com",
      customAttributes: {
        offerCode: "GROV20",
        loyaltyTier: "Platinum",
      },
    };

    it("resolves {{1}} -> First Name using {{contact.firstName}} preset from UI", () => {
      const result = resolveContactTemplateParameters(
        "jaspers_market_order_confirmation_v1",
        {
          "1": "{{contact.firstName}}",
          "2": "GRV-10294",
          "3": "Friday, Oct 24",
        },
        validContact
      );

      expect(result.success).toBe(true);
      expect(result.parameters).toEqual({
        "1": "Balaji",
        "2": "GRV-10294",
        "3": "Friday, Oct 24",
      });
    });

    it("resolves {{contact.first_name}}, {{firstName}}, and {{first_name}} variations", () => {
      for (const token of ["{{contact.first_name}}", "{{firstName}}", "{{first_name}}"]) {
        const result = resolveContactTemplateParameters(
          "jaspers_market_order_confirmation_v1",
          {
            "1": token,
            "2": "GRV-10294",
            "3": "Friday, Oct 24",
          },
          validContact
        );

        expect(result.success).toBe(true);
        expect(result.parameters?.["1"]).toBe("Balaji");
      }
    });

    it("resolves custom two-variable template ({{1}} -> First Name, {{2}} -> static Offer Code)", () => {
      const result = resolveContactTemplateParameters(
        "new_campaign_offer",
        {
          "1": "{{contact.firstName}}",
          "2": "GROV20",
        },
        validContact
      );

      expect(result.success).toBe(true);
      expect(result.parameters).toEqual({
        "1": "Balaji",
        "2": "GROV20",
      });
    });

    it("resolves custom two-variable template ({{1}} -> First Name, {{2}} -> dynamic Offer Code from contact attributes)", () => {
      const result = resolveContactTemplateParameters(
        "new_campaign_offer",
        {
          "1": "{{contact.firstName}}",
          "2": "{{contact.customAttributes.offerCode}}",
        },
        validContact
      );

      expect(result.success).toBe(true);
      expect(result.parameters).toEqual({
        "1": "Balaji",
        "2": "GROV20",
      });
    });

    it("fails safely when contact has null or empty firstName and does NOT substitute sample values", () => {
      const contactNoName = {
        id: "cnt_empty_002",
        firstName: null,
        lastName: null,
        phoneNumber: "+919876543210",
      };

      const result = resolveContactTemplateParameters(
        "new_campaign_offer",
        {
          "1": "{{contact.firstName}}",
          "2": "GROV20",
        },
        contactNoName
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("missing attribute 'contact.firstName'");
      expect(result.missingField).toBe("contact.firstName");
      expect(result.parameters).toBeUndefined();
    });

    it("fails safely when dynamic offerCode is missing from contact custom attributes", () => {
      const contactNoOffer = {
        id: "cnt_no_offer_003",
        firstName: "Priya",
        phoneNumber: "+919876543210",
        customAttributes: {},
      };

      const result = resolveContactTemplateParameters(
        "new_campaign_offer",
        {
          "1": "{{contact.firstName}}",
          "2": "{{contact.customAttributes.offerCode}}",
        },
        contactNoOffer
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("missing attribute 'contact.customAttributes.offerCode'");
      expect(result.missingField).toBe("contact.customAttributes.offerCode");
      expect(result.parameters).toBeUndefined();
    });

    it("resolves Full Name, Phone, and Email tokens correctly", () => {
      const resultName = resolveContactTemplateParameters(
        "custom_template",
        {
          "1": "{{contact.name}}",
          "2": "{{contact.phoneNumber}}",
          "3": "{{contact.email}}",
        },
        validContact
      );

      expect(resultName.success).toBe(true);
      expect(resultName.parameters).toEqual({
        "1": "Balaji Gottimukkala",
        "2": "+919876543210",
        "3": "balaji@example.com",
      });
    });
  });
});
