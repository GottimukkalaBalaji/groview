import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  TemplateStudioAuthoring,
  buildMetaSubmissionPayload,
  DraftState,
} from "../components/TemplateStudioAuthoring.js";
import { WhatsAppTemplate } from "../types/template.js";
import { apiClient } from "../services/api.js";
import * as AuthContextModule from "../context/AuthContext.js";

vi.mock("../services/api.js", () => ({
  apiClient: {
    listTemplates: vi.fn(),
    syncTemplates: vi.fn(),
    createTemplate: vi.fn(),
    validateTemplateParameters: vi.fn(),
  },
}));

const validInitialTemplate: WhatsAppTemplate = {
  id: "tpl_test_1",
  name: "new_campaign_offer",
  language: "en_US",
  category: "MARKETING",
  status: "LOCAL_DRAFT",
  header: { type: "NONE" },
  body: "Hello {{1}}! Thank you for choosing Grovastra. Your special code is {{2}}.",
  variables: [
    { key: "1", fallbackValue: "Priya", sampleValue: "Priya" },
    { key: "2", fallbackValue: "GROV20", sampleValue: "GROV20" },
  ],
  footer: "Reply STOP to unsubscribe.",
  buttons: [
    { id: "b1", type: "URL", text: "Visit Store", url: "https://grovastra.com" },
    { id: "b2", type: "PHONE_NUMBER", text: "Call Support", phoneNumber: "+15551234567" },
  ],
};

describe("Template Studio Meta Submission & Approval Flow", () => {
  const mockOnBack = vi.fn();
  const mockOnDraftSaved = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
      user: {
        id: "usr_admin",
        email: "superadmin@grovastra.com",
        firstName: "Super",
        lastName: "Admin",
        role: "ADMIN",
        platformRole: "PLATFORM_MASTER_ADMIN",
        organizationId: "org_master",
        createdAt: new Date().toISOString(),
      },
      organization: { id: "org_master", name: "Grovastra Platform", slug: "grovastra-platform" },
      platformCapabilities: {
        isPlatformAdmin: true,
        platformRole: "PLATFORM_MASTER_ADMIN",
        canManagePlatformWhatsApp: true,
        canManageAllOrganizations: true,
        canAssignBusinesses: true,
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      signup: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });
  });

  describe("1. buildMetaSubmissionPayload unit tests", () => {
    it("correctly converts standard draft state to Meta components format", () => {
      const draft: DraftState = {
        name: "spring_sale_offer",
        category: "MARKETING",
        language: "en_US",
        headerType: "TEXT",
        headerText: "Welcome {{1}}!",
        headerMediaUrl: "",
        headerMediaSource: "URL",
        body: "Hello {{1}}! Your discount code is {{2}}.",
        footer: "Reply STOP to unsubscribe.",
        buttons: [
          {
            id: "b1",
            type: "URL",
            text: "Visit Store",
            url: "https://grovastra.com/shop",
          },
          {
            id: "b2",
            type: "PHONE_NUMBER",
            text: "Call Support",
            phoneNumber: "+15551234567",
          },
        ],
        variables: {
          "1": "Priya",
          "2": "SPRING20",
        },
      };

      const payload = buildMetaSubmissionPayload(draft);

      expect(payload.name).toBe("spring_sale_offer");
      expect(payload.category).toBe("MARKETING");
      expect(payload.language).toBe("en_US");
      expect(payload.components).toHaveLength(4);

      // Header component
      const headerComp = payload.components.find((c) => c.type === "HEADER");
      expect(headerComp).toBeDefined();
      expect(headerComp?.format).toBe("TEXT");
      expect(headerComp?.text).toBe("Welcome {{1}}!");
      expect(headerComp?.example?.header_text).toEqual(["Priya"]);

      // Body component
      const bodyComp = payload.components.find((c) => c.type === "BODY");
      expect(bodyComp).toBeDefined();
      expect(bodyComp?.text).toBe("Hello {{1}}! Your discount code is {{2}}.");
      expect(bodyComp?.example?.body_text).toEqual([["Priya", "SPRING20"]]);

      // Footer component
      const footerComp = payload.components.find((c) => c.type === "FOOTER");
      expect(footerComp?.text).toBe("Reply STOP to unsubscribe.");

      // Buttons component
      const btnComp = payload.components.find((c) => c.type === "BUTTONS");
      expect(btnComp?.buttons).toHaveLength(2);
      expect(btnComp?.buttons?.[0]).toEqual({
        type: "URL",
        text: "Visit Store",
        url: "https://grovastra.com/shop",
      });
      expect(btnComp?.buttons?.[1]).toEqual({
        type: "PHONE_NUMBER",
        text: "Call Support",
        phone_number: "+15551234567",
      });
    });
  });

  describe("2. UI Submission Review Modal & User Confirmation", () => {
    it("renders separate 'Save Local Draft' and 'Submit to Meta for Review' buttons", () => {
      render(
        <TemplateStudioAuthoring
          onBack={mockOnBack}
          onDraftSaved={mockOnDraftSaved}
          initialTemplate={validInitialTemplate}
        />
      );

      expect(screen.getByRole("button", { name: /save local draft/i })).toBeInTheDocument();
      expect(screen.getByTestId("submit-meta-btn")).toBeInTheDocument();
      expect(screen.getByText(/submit to meta for review/i)).toBeInTheDocument();
    });

    it("opens review modal with full template specification when Submit to Meta is clicked", async () => {
      render(
        <TemplateStudioAuthoring
          onBack={mockOnBack}
          onDraftSaved={mockOnDraftSaved}
          initialTemplate={validInitialTemplate}
        />
      );

      const submitBtn = screen.getByTestId("submit-meta-btn");
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByTestId("submit-meta-modal")).toBeInTheDocument();
      });

      expect(screen.getByText(/Review & Confirm Meta Submission/i)).toBeInTheDocument();
      expect(screen.getByText(/Important Policy Notice/i)).toBeInTheDocument();
      expect(screen.getByTestId("confirm-meta-policy-check")).toBeInTheDocument();
      expect(screen.getByTestId("confirm-submit-meta-btn")).toBeDisabled(); // Disabled until confirmed
    });

    it("enables the confirm button only when the policy confirmation checkbox is checked", async () => {
      render(
        <TemplateStudioAuthoring
          onBack={mockOnBack}
          onDraftSaved={mockOnDraftSaved}
          initialTemplate={validInitialTemplate}
        />
      );

      fireEvent.click(screen.getByTestId("submit-meta-btn"));

      await waitFor(() => {
        expect(screen.getByTestId("confirm-submit-meta-btn")).toBeDisabled();
      });

      const checkbox = screen.getByTestId("confirm-meta-policy-check");
      fireEvent.click(checkbox);

      expect(checkbox).toBeChecked();
      expect(screen.getByTestId("confirm-submit-meta-btn")).not.toBeDisabled();
    });

    it("submits template to Meta API, shows PENDING status and returned Meta ID on success", async () => {
      vi.mocked(apiClient.createTemplate).mockResolvedValueOnce({
        success: true,
        data: {
          id: "123456789012345",
          name: "new_campaign_offer",
          status: "PENDING",
          category: "MARKETING",
          language: "en_US",
        },
      } as any);

      render(
        <TemplateStudioAuthoring
          onBack={mockOnBack}
          onDraftSaved={mockOnDraftSaved}
          initialTemplate={validInitialTemplate}
        />
      );

      fireEvent.click(screen.getByTestId("submit-meta-btn"));

      await waitFor(() => {
        expect(screen.getByTestId("confirm-meta-policy-check")).toBeInTheDocument();
      });

      const checkbox = screen.getByTestId("confirm-meta-policy-check");
      fireEvent.click(checkbox);

      await waitFor(() => {
        expect(screen.getByTestId("confirm-submit-meta-btn")).not.toBeDisabled();
      });

      fireEvent.click(screen.getByTestId("confirm-submit-meta-btn"));

      await waitFor(() => {
        expect(apiClient.createTemplate).toHaveBeenCalledTimes(1);
      });

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /Submitted to Meta for Review/i })).toBeInTheDocument();
      });

      // Verifies Meta ID and actual PENDING status are rendered
      expect(screen.getByTestId("meta-template-id")).toHaveTextContent("123456789012345");
      expect(screen.getByTestId("meta-returned-status")).toHaveTextContent("PENDING");
      expect(screen.getByTestId("meta-returned-status")).not.toHaveTextContent("APPROVED");
    });

    it("displays sanitized error message when Meta rejects submission", async () => {
      vi.mocked(apiClient.createTemplate).mockRejectedValueOnce(
        new Error("A template with the name \"new_campaign_offer\" already exists on this Meta WhatsApp Business Account.")
      );

      render(
        <TemplateStudioAuthoring
          onBack={mockOnBack}
          onDraftSaved={mockOnDraftSaved}
          initialTemplate={validInitialTemplate}
        />
      );

      fireEvent.click(screen.getByTestId("submit-meta-btn"));

      await waitFor(() => {
        expect(screen.getByTestId("confirm-meta-policy-check")).toBeInTheDocument();
      });

      const checkbox = screen.getByTestId("confirm-meta-policy-check");
      fireEvent.click(checkbox);

      await waitFor(() => {
        expect(screen.getByTestId("confirm-submit-meta-btn")).not.toBeDisabled();
      });

      fireEvent.click(screen.getByTestId("confirm-submit-meta-btn"));

      await waitFor(() => {
        expect(screen.getByText(/Meta Submission Failed/i)).toBeInTheDocument();
      });

      expect(screen.getByTestId("submission-error-message")).toHaveTextContent(
        /already exists on this Meta WhatsApp Business Account/i
      );
    });
  });
});
