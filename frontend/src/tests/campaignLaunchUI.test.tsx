import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LaunchConfirmationModal } from "../components/LaunchConfirmationModal.js";
import { LaunchResultModal } from "../components/LaunchResultModal.js";
import { CampaignsPage } from "../pages/CampaignsPage.js";
import { CampaignList } from "../components/CampaignList.js";
import { CampaignDetailsModal } from "../components/CampaignDetailsModal.js";
import { apiClient } from "../services/api.js";
import { Campaign, LaunchCampaignSummary, CampaignQueueRecoverySummary } from "../types/campaign.js";

// Mock API client
vi.mock("../services/api.js", () => {
  class MockApiClientError extends Error {
    public statusCode: number;
    public code: string;
    constructor(message: string, statusCode: number, code = "UNKNOWN_ERROR") {
      super(message);
      this.name = "ApiClientError";
      this.statusCode = statusCode;
      this.code = code;
    }
  }

  return {
    apiClient: {
      listCampaigns: vi.fn(),
      getCampaign: vi.fn(),
      createCampaign: vi.fn(),
      updateCampaign: vi.fn(),
      duplicateCampaign: vi.fn(),
      deleteCampaign: vi.fn(),
      sendCampaign: vi.fn(),
      retryCampaignQueue: vi.fn(),
      listAudiences: vi.fn(),
      listTemplates: vi.fn(),
      validateTemplateParameters: vi.fn(),
    },
    ApiClientError: MockApiClientError,
  };
});

describe("Phase 10 Step 2: Campaign Launch UI Tests", () => {
  const sampleCampaign: Campaign = {
    id: "cmp_oct26_diwali",
    organizationId: "org_alpha",
    name: "Diwali Big Festive Sale",
    description: "Special seasonal discounts for loyal customers",
    status: "DRAFT",
    templateId: "tpl_festive_offer",
    templateName: "festive_promo_2026",
    templateLanguage: "en_US",
    templateCategory: "MARKETING",
    variablesMapping: {
      "1": "{{contact.firstName}}",
      "2": "30% OFF",
    },
    audienceType: "CONTACT_LIST",
    audienceId: "list_retail_vip",
    audienceName: "Retail VIP Customers",
    totalRecipients: 250,
    scheduledAt: null,
    startedAt: null,
    completedAt: null,
    createdBy: "usr_manager",
    createdAt: "2026-10-15T10:00:00.000Z",
    updatedAt: "2026-10-16T08:00:00.000Z",
  };

  const sampleLaunchSummary: LaunchCampaignSummary = {
    campaignId: "cmp_oct26_diwali",
    campaignName: "Diwali Big Festive Sale",
    status: "QUEUED",
    totalAudienceCount: 260,
    eligibleCount: 240,
    queuedCount: 240,
    alreadyPreparedCount: 0,
    enqueueSuccessCount: 240,
    enqueueFailureCount: 0,
    excludedCount: {
      consentRequired: 15,
      suppressed: 5,
      invalidPhone: 0,
      missingVariables: 0,
    },
    sampleExclusions: [
      { contactId: "cnt_991", phone: "+919876543210", reason: "Consent is OPTED_OUT" },
    ],
  };

  const partialFailureLaunchSummary: LaunchCampaignSummary = {
    ...sampleLaunchSummary,
    enqueueSuccessCount: 180,
    enqueueFailureCount: 60,
  };

  const sampleRecoverySummary: CampaignQueueRecoverySummary = {
    campaignId: "cmp_oct26_diwali",
    campaignName: "Diwali Big Festive Sale",
    status: "QUEUED",
    totalPersistedMessages: 240,
    eligibleQueuedCount: 60,
    enqueuedSuccessCount: 60,
    alreadyEnqueuedCount: 180,
    enqueueFailureCount: 0,
    terminalCount: 0,
    inFlightCount: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.listTemplates).mockResolvedValue({
      status: "success",
      data: { templates: [] },
    } as any);
    if ((apiClient as any).getCampaignMessages) {
      vi.mocked((apiClient as any).getCampaignMessages).mockResolvedValue({
        success: true,
        data: { items: [], total: 0 },
      } as any);
    }
  });

  // ── 1. Launch Confirmation Modal Tests ─────────────────────────────────────

  describe("LaunchConfirmationModal", () => {
    it("renders campaign name, template, audience, and consequences before confirmation", () => {
      render(
        <LaunchConfirmationModal
          isOpen={true}
          campaign={sampleCampaign}
          isLaunching={false}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          eligibleCount={240}
        />
      );

      expect(screen.getByText("Confirm Campaign Launch")).toBeDefined();
      expect(screen.getByText(/Diwali Big Festive Sale/)).toBeDefined();
      expect(screen.getByText("festive_promo_2026 (en_US)")).toBeDefined();
      expect(screen.getByText("Retail VIP Customers")).toBeDefined();
      expect(screen.getByText(/240 verified opted-in contacts/)).toBeDefined();

      // Check consequences callouts
      expect(screen.getByText(/What happens when you confirm:/)).toBeDefined();
      expect(screen.getByText(/prepared in the campaign workspace with status/)).toBeDefined();
      expect(screen.getByText("OPTED_IN")).toBeDefined();
      expect(screen.getByText(/Only contacts with verified/)).toBeDefined();
    });

    it("displays 'Unavailable' when recipient count is 0 or undefined", () => {
      render(
        <LaunchConfirmationModal
          isOpen={true}
          campaign={{ ...sampleCampaign, totalRecipients: 0 }}
          isLaunching={false}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          eligibleCount={null}
        />
      );

      expect(screen.getByText("Unavailable (calculated at launch)")).toBeDefined();
    });

    it("triggers onCancel when Cancel button is clicked or Escape is pressed", () => {
      const handleCancel = vi.fn();
      render(
        <LaunchConfirmationModal
          isOpen={true}
          campaign={sampleCampaign}
          isLaunching={false}
          onConfirm={vi.fn()}
          onCancel={handleCancel}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(handleCancel).toHaveBeenCalledTimes(1);

      fireEvent.keyDown(window, { key: "Escape" });
      expect(handleCancel).toHaveBeenCalledTimes(2);
    });

    it("prevents duplicate submissions: ignores clicks while request is pending", () => {
      const handleConfirm = vi.fn();
      const { rerender } = render(
        <LaunchConfirmationModal
          isOpen={true}
          campaign={sampleCampaign}
          isLaunching={false}
          onConfirm={handleConfirm}
          onCancel={vi.fn()}
        />
      );

      const confirmBtn = screen.getByRole("button", { name: /Confirm & Queue Dispatch/ });
      fireEvent.click(confirmBtn);
      expect(handleConfirm).toHaveBeenCalledTimes(1);

      // Now set isLaunching to true (simulate pending request)
      rerender(
        <LaunchConfirmationModal
          isOpen={true}
          campaign={sampleCampaign}
          isLaunching={true}
          onConfirm={handleConfirm}
          onCancel={vi.fn()}
        />
      );

      // Verify button is disabled and shows loading text
      expect(screen.getByText("Queueing Messages...")).toBeDefined();
      expect(confirmBtn.closest("button")?.hasAttribute("disabled")).toBe(true);

      // Extra click while pending should be ignored
      fireEvent.click(confirmBtn);
      expect(handleConfirm).toHaveBeenCalledTimes(1);
    });

    it("renders safe error banner without leaking tokens or secrets", () => {
      render(
        <LaunchConfirmationModal
          isOpen={true}
          campaign={sampleCampaign}
          isLaunching={false}
          launchError="Redis dispatch queue is not configured or unreachable."
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.getByRole("alert")).toBeDefined();
      expect(
        screen.getByText("Redis dispatch queue is not configured or unreachable.")
      ).toBeDefined();
    });
  });

  // ── 2. Launch Result Modal Tests ───────────────────────────────────────────

  describe("LaunchResultModal", () => {
    it("displays actual campaign status (QUEUED) and queue counts on success", () => {
      render(
        <LaunchResultModal
          isOpen={true}
          launchSummary={sampleLaunchSummary}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText("Campaign Launch Result")).toBeDefined();
      expect(screen.getByText("QUEUED")).toBeDefined();
      expect(screen.getByText("260")).toBeDefined(); // Total Audience
      expect(screen.getAllByText("240").length).toBeGreaterThanOrEqual(1); // Eligible / Queued / Enqueued
      expect(screen.getByText("Preparation and Queueing Successful")).toBeDefined();

      // Check auditable exclusions breakdown
      expect(screen.getByText("Consent Required")).toBeDefined();
      expect(screen.getByText("15")).toBeDefined();
      expect(screen.getByText("Suppressed")).toBeDefined();
      expect(screen.getByText("5")).toBeDefined();
    });

    it("distinguishes dispatch from delivery clearly", () => {
      render(
        <LaunchResultModal
          isOpen={true}
          launchSummary={sampleLaunchSummary}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText(/Dispatch vs Delivery Distinction:/)).toBeDefined();
      expect(
        screen.getByText(/reflect messages queued for dispatch/)
      ).toBeDefined();
    });

    it("handles partial enqueue failure and offers a clearly labeled 'Retry Queue' button", () => {
      const handleRetryQueue = vi.fn();
      render(
        <LaunchResultModal
          isOpen={true}
          launchSummary={partialFailureLaunchSummary}
          onClose={vi.fn()}
          onRetryQueue={handleRetryQueue}
        />
      );

      expect(screen.getByText("Partial Queue Failure Detected")).toBeDefined();
      expect(screen.getByText("Enqueue Failed")).toBeDefined();
      expect(screen.getByText("60")).toBeDefined();

      const retryBtn = screen.getByRole("button", { name: /Retry Queue \(60\)/ });
      expect(retryBtn).toBeDefined();

      fireEvent.click(retryBtn);
      expect(handleRetryQueue).toHaveBeenCalledTimes(1);
    });

    it("displays queue recovery summary accurately", () => {
      render(
        <LaunchResultModal
          isOpen={true}
          recoverySummary={sampleRecoverySummary}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText("Queue Recovery Result")).toBeDefined();
      expect(screen.getByText("Queue Recovery Audit")).toBeDefined();
      expect(screen.getByText("Eligible QUEUED")).toBeDefined();
      expect(screen.getByText("Newly Enqueued")).toBeDefined();
      expect(screen.getByText("Already in Queue")).toBeDefined();
    });
  });

  // ── 3. CampaignList Status Distinction Tests ───────────────────────────────

  describe("CampaignList Status Distinction", () => {
    it("clearly distinguishes QUEUED from SENDING with accurate labels and pills", () => {
      const queuedCampaign: Campaign = { ...sampleCampaign, id: "cmp_queued", status: "QUEUED" };
      const sendingCampaign: Campaign = { ...sampleCampaign, id: "cmp_sending", status: "SENDING" };
      const completedCampaign: Campaign = { ...sampleCampaign, id: "cmp_done", status: "COMPLETED" };

      render(
        <CampaignList
          campaigns={[queuedCampaign, sendingCampaign, completedCampaign]}
          metrics={{ total: 3, draft: 0, scheduled: 0, sending: 2, completed: 1, failed: 0, cancelled: 0 }}
          pagination={{ page: 1, limit: 10, total: 3, totalPages: 1, hasNextPage: false, hasPrevPage: false }}
          onPageChange={vi.fn()}
          onLimitChange={vi.fn()}
          isLoading={false}
          error={null}
          searchTerm=""
          onSearchChange={vi.fn()}
          statusFilter="ALL"
          onStatusFilterChange={vi.fn()}
          onRefresh={vi.fn()}
          onCreateCampaign={vi.fn()}
          onEditCampaign={vi.fn()}
          onDuplicateCampaign={vi.fn()}
          onViewDetails={vi.fn()}
          onDeleteCampaign={vi.fn()}
          onLaunchCampaign={vi.fn()}
          onRetryQueue={vi.fn()}
        />
      );

      // Verify Queued is not displayed as "Sending"
      expect(screen.getAllByText("Queued").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Sending").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
    });

    it("renders Launch action for DRAFT and Retry Queue action for QUEUED campaigns", () => {
      const draftCampaign: Campaign = { ...sampleCampaign, id: "cmp_draft", status: "DRAFT" };
      const queuedCampaign: Campaign = { ...sampleCampaign, id: "cmp_queued", status: "QUEUED" };

      const handleLaunch = vi.fn();
      const handleRetryQueue = vi.fn();

      render(
        <CampaignList
          campaigns={[draftCampaign, queuedCampaign]}
          metrics={{ total: 2, draft: 1, scheduled: 0, sending: 1, completed: 0, failed: 0, cancelled: 0 }}
          pagination={{ page: 1, limit: 10, total: 2, totalPages: 1, hasNextPage: false, hasPrevPage: false }}
          onPageChange={vi.fn()}
          onLimitChange={vi.fn()}
          isLoading={false}
          error={null}
          searchTerm=""
          onSearchChange={vi.fn()}
          statusFilter="ALL"
          onStatusFilterChange={vi.fn()}
          onRefresh={vi.fn()}
          onCreateCampaign={vi.fn()}
          onEditCampaign={vi.fn()}
          onDuplicateCampaign={vi.fn()}
          onViewDetails={vi.fn()}
          onDeleteCampaign={vi.fn()}
          onLaunchCampaign={handleLaunch}
          onRetryQueue={handleRetryQueue}
        />
      );

      const launchBtn = screen.getByLabelText(`Launch ${draftCampaign.name}`);
      expect(launchBtn).toBeDefined();
      fireEvent.click(launchBtn);
      expect(handleLaunch).toHaveBeenCalledWith(draftCampaign);

      const retryBtn = screen.getByLabelText(`Retry queue for ${queuedCampaign.name}`);
      expect(retryBtn).toBeDefined();
      fireEvent.click(retryBtn);
      expect(handleRetryQueue).toHaveBeenCalledWith(queuedCampaign);
    });
  });

  // ── 4. CampaignDetailsModal Actions Tests ───────────────────────────────────

  describe("CampaignDetailsModal Dispatch Actions", () => {
    it("renders 'Review & Launch' for DRAFT and 'Retry Queue' for QUEUED", () => {
      const handleLaunch = vi.fn();
      const handleClose = vi.fn();

      const { rerender } = render(
        <CampaignDetailsModal
          isOpen={true}
          campaign={sampleCampaign}
          onClose={handleClose}
          onLaunch={handleLaunch}
        />
      );

      const launchBtn = screen.getByRole("button", { name: /Review & Launch/ });
      expect(launchBtn).toBeDefined();
      fireEvent.click(launchBtn);
      expect(handleClose).toHaveBeenCalled();
      expect(handleLaunch).toHaveBeenCalledWith(sampleCampaign);

      // Now rerender with QUEUED campaign
      const handleRetry = vi.fn();
      rerender(
        <CampaignDetailsModal
          isOpen={true}
          campaign={{ ...sampleCampaign, status: "QUEUED" }}
          onClose={handleClose}
          onRetryQueue={handleRetry}
        />
      );

      const retryBtn = screen.getByRole("button", { name: /Retry Queue/ });
      expect(retryBtn).toBeDefined();
      fireEvent.click(retryBtn);
      expect(handleRetry).toHaveBeenCalled();
    });
  });

  // ── 5. End-to-End CampaignsPage Launch Workflow ─────────────────────────────

  describe("CampaignsPage End-to-End Launch & Queue Recovery Flow", () => {
    it("completes full launch workflow: opens confirmation, calls API, displays result summary", async () => {
      vi.mocked(apiClient.listCampaigns).mockResolvedValue({
        success: true,
        data: {
          items: [sampleCampaign],
          pagination: { page: 1, limit: 10, total: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false },
          metrics: { total: 1, draft: 1, scheduled: 0, sending: 0, completed: 0, failed: 0, cancelled: 0 },
        },
      } as any);

      vi.mocked(apiClient.sendCampaign).mockResolvedValue({
        success: true,
        data: sampleLaunchSummary,
      } as any);

      render(<CampaignsPage />);

      // Wait for campaign list to load
      await waitFor(() => {
        expect(screen.getAllByText("Diwali Big Festive Sale").length).toBeGreaterThanOrEqual(1);
      });

      // Click Launch button in the list (desktop or mobile)
      const launchBtn = screen.getAllByLabelText(`Launch ${sampleCampaign.name}`)[0];
      fireEvent.click(launchBtn);

      // Confirm modal opens
      expect(screen.getByText("Confirm Campaign Launch")).toBeDefined();

      // Click confirm
      const confirmBtn = screen.getByRole("button", { name: /Confirm & Queue Dispatch/ });
      fireEvent.click(confirmBtn);

      // Verify sendCampaign API was called with campaign ID
      await waitFor(() => {
        expect(apiClient.sendCampaign).toHaveBeenCalledWith(sampleCampaign.id);
      });

      // Verify LaunchResultModal is displayed with QUEUED status
      await waitFor(() => {
        expect(screen.getByText("Campaign Launch Result")).toBeDefined();
        expect(screen.getByText("Preparation and Queueing Successful")).toBeDefined();
      });
    });

    it("handles partial enqueue failure in CampaignsPage and executes queue recovery", async () => {
      vi.mocked(apiClient.listCampaigns).mockResolvedValue({
        success: true,
        data: {
          items: [sampleCampaign],
          pagination: { page: 1, limit: 10, total: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false },
          metrics: { total: 1, draft: 1, scheduled: 0, sending: 0, completed: 0, failed: 0, cancelled: 0 },
        },
      } as any);

      vi.mocked(apiClient.sendCampaign).mockResolvedValue({
        success: true,
        data: partialFailureLaunchSummary,
      } as any);

      vi.mocked(apiClient.retryCampaignQueue).mockResolvedValue({
        success: true,
        data: sampleRecoverySummary,
      } as any);

      render(<CampaignsPage />);

      await waitFor(() => {
        expect(screen.getAllByText("Diwali Big Festive Sale").length).toBeGreaterThanOrEqual(1);
      });

      // Launch campaign
      fireEvent.click(screen.getAllByLabelText(`Launch ${sampleCampaign.name}`)[0]);
      fireEvent.click(screen.getByRole("button", { name: /Confirm & Queue Dispatch/ }));

      // Wait for partial failure result modal
      await waitFor(() => {
        expect(screen.getByText("Partial Queue Failure Detected")).toBeDefined();
      });

      // Click Retry Queue
      const retryBtn = screen.getByRole("button", { name: /Retry Queue \(60\)/ });
      fireEvent.click(retryBtn);

      // Verify retryCampaignQueue was called
      await waitFor(() => {
        expect(apiClient.retryCampaignQueue).toHaveBeenCalledWith(sampleCampaign.id);
        expect(screen.getByText("Queue Recovery Result")).toBeDefined();
      });
    });
  });
});
