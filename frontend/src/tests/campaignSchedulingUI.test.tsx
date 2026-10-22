import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LaunchConfirmationModal } from "../components/LaunchConfirmationModal.js";
import { CampaignWizard } from "../components/CampaignWizard.js";
import { CampaignList } from "../components/CampaignList.js";
import { CampaignsPage } from "../pages/CampaignsPage.js";
import { apiClient } from "../services/api.js";
import { Campaign } from "../types/campaign.js";
import {
  DEFAULT_BUSINESS_TIMEZONE,
  BUSINESS_TIMEZONE_LABEL,
  formatInBusinessTimezone,
  parseScheduleToUTC,
  isValidFutureSchedule,
  getDefaultScheduleInputs,
} from "../utils/timezone.js";
import { getCustomerCampaignStatus } from "../utils/campaignStatus.js";

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
      scheduleCampaign: vi.fn(),
      cancelCampaign: vi.fn(),
      getSchedulerStatus: vi.fn(),
      listAudiences: vi.fn(),
      listTemplates: vi.fn(),
      validateTemplateParameters: vi.fn(),
    },
    ApiClientError: MockApiClientError,
  };
});

describe("Campaign Scheduling & Recovery UI Tests", () => {
  const sampleScheduledCampaign: Campaign = {
    id: "cmp_scheduled_diwali",
    organizationId: "org_alpha",
    name: "Diwali Scheduled Blast",
    description: "Scheduled festive promo for retail customers",
    status: "SCHEDULED",
    templateId: "tpl_festive_offer",
    templateName: "festive_promo_2026",
    templateLanguage: "en_US",
    templateCategory: "MARKETING",
    variablesMapping: { "1": "Balaji" },
    audienceType: "CONTACT_LIST",
    audienceId: "list_retail_vip",
    audienceName: "Retail VIP Customers",
    totalRecipients: 100,
    scheduledAt: "2026-10-25T04:30:00.000Z", // 10:00 AM IST
    startedAt: null,
    completedAt: null,
    createdBy: "usr_admin",
    createdAt: "2026-10-17T00:00:00.000Z",
    updatedAt: "2026-10-17T00:00:00.000Z",
  };

  const sampleDraftCampaign: Campaign = {
    id: "cmp_draft_diwali",
    organizationId: "org_alpha",
    name: "Diwali Draft Campaign",
    description: "Draft festive promo",
    status: "DRAFT",
    templateId: "tpl_festive_offer",
    templateName: "festive_promo_2026",
    templateLanguage: "en_US",
    templateCategory: "MARKETING",
    variablesMapping: { "1": "Balaji" },
    audienceType: "CONTACT_LIST",
    audienceId: "list_retail_vip",
    audienceName: "Retail VIP Customers",
    totalRecipients: 100,
    scheduledAt: null,
    startedAt: null,
    completedAt: null,
    createdBy: "usr_admin",
    createdAt: "2026-10-17T00:00:00.000Z",
    updatedAt: "2026-10-17T00:00:00.000Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Timezone Utilities (Asia/Kolkata default)", () => {
    it("enforces Asia/Kolkata and IST (+05:30) label", () => {
      expect(DEFAULT_BUSINESS_TIMEZONE).toBe("Asia/Kolkata");
      expect(BUSINESS_TIMEZONE_LABEL).toContain("IST");
      expect(BUSINESS_TIMEZONE_LABEL).toContain("+05:30");
    });

    it("correctly parses local IST date and time into UTC ISO string", () => {
      // 2026-11-01 10:00 AM IST -> 2026-11-01 04:30:00.000Z
      const utcString = parseScheduleToUTC("2026-11-01", "10:00");
      expect(utcString).toBe("2026-11-01T04:30:00.000Z");
    });

    it("formats UTC timestamp in Asia/Kolkata with readable format", () => {
      const formatted = formatInBusinessTimezone("2026-11-01T04:30:00.000Z");
      expect(formatted).toContain("10:00");
      expect(formatted).toContain("IST");
    });

    it("validates future schedule times and rejects past or invalid times", () => {
      // Far future
      const futureIso = parseScheduleToUTC("2030-01-01", "10:00");
      expect(isValidFutureSchedule(futureIso)).toBe(true);

      // Past date
      const pastIso = parseScheduleToUTC("2020-01-01", "10:00");
      expect(isValidFutureSchedule(pastIso)).toBe(false);

      // Invalid inputs
      expect(isValidFutureSchedule("")).toBe(false);
      expect(isValidFutureSchedule("invalid-date-string")).toBe(false);
    });

    it("provides valid default schedule inputs in IST", () => {
      const defaults = getDefaultScheduleInputs();
      expect(defaults.date).toBeDefined();
      expect(defaults.time).toMatch(/^\d{2}:\d{2}$/);
      const scheduledIso = parseScheduleToUTC(defaults.date, defaults.time);
      expect(isValidFutureSchedule(scheduledIso)).toBe(true);
    });
  });

  describe("2. Customer-Facing Status Badges", () => {
    it("displays Scheduled badge with helperText when scheduled time is in the future", () => {
      const futureTime = new Date(Date.now() + 86400000).toISOString();
      const status = getCustomerCampaignStatus({
        status: "SCHEDULED",
        scheduledAt: futureTime,
      });
      expect(status.label).toBe("Scheduled");
      expect(status.isOverdue).toBe(false);
      expect(status.helperText).toContain("Scheduled for");
      expect(status.helperText).toContain("IST");
    });

    it("displays 'Scheduled time missed — waiting for dispatch' when scheduled time has passed", () => {
      const pastTime = new Date(Date.now() - 3600000).toISOString();
      const status = getCustomerCampaignStatus({
        status: "SCHEDULED",
        scheduledAt: pastTime,
      });
      expect(status.label).toBe("Scheduled time missed — waiting for dispatch");
      expect(status.isOverdue).toBe(true);
      expect(status.helperText).toContain("Originally scheduled for");
    });

    it("provides clean customer-friendly labels for processing, completed, and failed statuses", () => {
      expect(getCustomerCampaignStatus({ status: "QUEUED" }).label).toBe("Preparing messages");
      expect(getCustomerCampaignStatus({ status: "SENDING" }).label).toBe("Sending");
      expect(getCustomerCampaignStatus({ status: "COMPLETED" }).label).toBe("Completed");
      expect(
        getCustomerCampaignStatus({
          status: "COMPLETED",
          failedRecipients: 3,
        }).label
      ).toBe("Completed with issues");
      expect(getCustomerCampaignStatus({ status: "FAILED" }).label).toBe("Failed");
      expect(getCustomerCampaignStatus({ status: "CANCELLED" }).label).toBe("Cancelled");
    });
  });

  describe("3. LaunchConfirmationModal with Scheduling", () => {
    it("renders scheduled campaign confirmation modal with IST time and safety warning", () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      render(
        <LaunchConfirmationModal
          isOpen={true}
          campaign={sampleScheduledCampaign}
          isLaunching={false}
          launchError={null}
          onConfirm={onConfirm}
          onCancel={onCancel}
          eligibleCount={100}
          scheduledAt="2026-10-25T04:30:00.000Z"
        />
      );

      // Modal heading & button
      expect(screen.getByText("Confirm Scheduled Campaign")).toBeDefined();
      expect(screen.getByRole("button", { name: /Confirm & Schedule Campaign/i })).toBeDefined();

      // Displays scheduled time in IST
      expect(screen.getByText(/Scheduled Dispatch/i)).toBeDefined();
      expect(screen.getAllByText(/25 Oct 2026/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/IST \(UTC\+05:30\)/i)).toBeDefined();

      // Explains that messages are NOT sent right now and can be edited or cancelled before dispatch
      expect(
        screen.getByText(/The campaign will be durably saved with status/i)
      ).toBeDefined();
      expect(
        screen.getByText(/You can cancel or edit this campaign anytime before dispatch starts/i)
      ).toBeDefined();
    });

    it("renders immediate launch modal when scheduledAt is null", () => {
      render(
        <LaunchConfirmationModal
          isOpen={true}
          campaign={sampleDraftCampaign}
          isLaunching={false}
          launchError={null}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          eligibleCount={100}
          scheduledAt={null}
        />
      );

      expect(screen.getByText("Confirm Campaign Launch")).toBeDefined();
      expect(screen.getByRole("button", { name: /Confirm & Queue Dispatch/i })).toBeDefined();
    });
  });

  describe("4. CampaignWizard Step 5: Send Now vs Schedule for Later", () => {
    const mockApprovedTemplate = {
      id: "tpl_plain",
      name: "jaspers_market_plain_text_v1",
      language: "en_US",
      category: "MARKETING",
      status: "APPROVED",
      isSendable: true,
      lastUpdated: "2026-10-15T12:00:00.000Z",
      body: "Welcome to Jaspers Market! Enjoy 20% off all organic groceries this weekend.",
      variables: [],
      footer: "Reply STOP to unsubscribe",
      buttons: [],
    };

    const mockAudiences = [
      {
        id: "list_retail_vip",
        name: "Retail VIP Customers",
        description: "High engagement members",
        memberCount: 100,
        eligibleMemberCount: 100,
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-15T00:00:00.000Z",
      },
    ];

    beforeEach(() => {
      vi.mocked(apiClient.listAudiences).mockResolvedValue({
        success: true,
        data: mockAudiences as any,
      } as any);

      vi.mocked(apiClient.listTemplates).mockResolvedValue({
        success: true,
        data: {
          templates: [mockApprovedTemplate],
          totalCount: 1,
          approvedCount: 1,
          source: "SHARED_PLATFORM_WABA",
        },
      } as any);
    });

    it("allows toggling between Send Now and Schedule for Later", async () => {
      const handleSave = vi.fn().mockResolvedValue(undefined);
      const handleLaunch = vi.fn().mockResolvedValue(undefined);
      const handleCancel = vi.fn();

      const { container } = render(
        <CampaignWizard
          onSave={handleSave}
          onLaunch={handleLaunch}
          onCancel={handleCancel}
          isSaving={false}
        />
      );

      // Step 1
      fireEvent.change(screen.getByPlaceholderText(/Diwali Mega Flash Sale 2026/i), {
        target: { value: "Scheduled Promo" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

      // Step 2
      await screen.findByText("Step 2: Select Message Template");
      fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

      // Step 3
      await screen.findByText("Step 3: Select Target Audience");
      fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

      // Step 4 (plain template -> no variables)
      await screen.findByText("Step 4: Configure Message Variables");
      fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

      // Step 5: Review Campaign Details
      await screen.findByText("Step 5: Review Campaign Details");

      // Verify Dispatch Timing section is present
      expect(screen.getByText("Dispatch Timing")).toBeDefined();
      expect(screen.getByLabelText(/Send now/i)).toBeDefined();
      const scheduleRadio = screen.getByLabelText(/Schedule for later/i);
      expect(scheduleRadio).toBeDefined();

      // By default: Review & Launch footer button is shown
      const launchBtn = container.querySelector("#wizard-launch-campaign-btn") as HTMLButtonElement;
      expect(launchBtn).toBeDefined();
      expect(launchBtn.textContent).toContain("Review & Launch");

      // Switch to Schedule for later
      fireEvent.click(scheduleRadio);

      // Date and Time inputs should now be visible
      expect(screen.getByLabelText(/Schedule Date/i)).toBeDefined();
      expect(screen.getByLabelText(/Schedule Time/i)).toBeDefined();
      expect(screen.getByText(/Business Timezone:/i)).toBeDefined();

      // Button label should now be "Review & Schedule"
      expect(launchBtn.textContent).toContain("Review & Schedule");

      // Click Review & Schedule -> opens confirmation modal with schedule details
      fireEvent.click(launchBtn);
      expect(await screen.findByText("Confirm Scheduled Campaign")).toBeDefined();
    });
  });

  describe("5. CampaignList Actions for Scheduled Campaigns", () => {
    it("renders Edit and Cancel buttons for SCHEDULED campaigns", () => {
      const onEdit = vi.fn();
      const onCancel = vi.fn();

      const { container } = render(
        <CampaignList
          campaigns={[sampleScheduledCampaign]}
          metrics={{ total: 1, draft: 0, scheduled: 1, sending: 0, completed: 0, failed: 0, cancelled: 0 }}
          pagination={{ page: 1, limit: 10, total: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false }}
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
          onViewDetails={vi.fn()}
          onDuplicateCampaign={vi.fn()}
          onDeleteCampaign={vi.fn()}
          onLaunchCampaign={vi.fn()}
          onRetryQueue={vi.fn()}
          onEditCampaign={onEdit}
          onCancelCampaign={onCancel}
        />
      );

      // Verify campaign is listed
      expect(screen.getAllByText("Diwali Scheduled Blast").length).toBeGreaterThanOrEqual(1);

      // Action buttons: Edit Campaign and Cancel Campaign
      const editBtn = screen.getByRole("button", { name: `Edit ${sampleScheduledCampaign.name}` });
      expect(editBtn).toBeDefined();

      const cancelBtn = container.querySelector(
        `#cancel-campaign-btn-${sampleScheduledCampaign.id}`
      ) as HTMLButtonElement;
      expect(cancelBtn).toBeDefined();

      // Clicking Cancel calls onCancelCampaign
      fireEvent.click(cancelBtn);
      expect(onCancel).toHaveBeenCalledWith(sampleScheduledCampaign);
    });
  });

  describe("6. CampaignsPage Operational Status & Cancellation Flow", () => {
    it("renders operational scheduler status banner and allows cancelling a scheduled campaign", async () => {
      vi.mocked(apiClient.listCampaigns).mockResolvedValue({
        success: true,
        data: {
          items: [sampleScheduledCampaign],
          pagination: { page: 1, limit: 10, total: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false },
          metrics: { total: 1, draft: 0, scheduled: 1, sending: 0, completed: 0, failed: 0, cancelled: 0 },
        },
      } as any);

      vi.mocked(apiClient.getSchedulerStatus).mockResolvedValue({
        success: true,
        data: {
          workerRunning: false,
          schedulerActive: true,
          scheduledCount: 1,
          dueCount: 0,
          overdueCount: 0,
          serverTime: new Date().toISOString(),
          serverTimezone: "Asia/Kolkata",
          maxLatenessHours: 24,
        },
      } as any);

      vi.mocked(apiClient.cancelCampaign).mockResolvedValue({
        success: true,
        data: {
          ...sampleScheduledCampaign,
          status: "CANCELLED",
        },
      } as any);

      const { container } = render(<CampaignsPage />);

      // Await campaign list loading
      await waitFor(() => {
        expect(screen.getAllByText("Diwali Scheduled Blast").length).toBeGreaterThanOrEqual(1);
      });

      // Operational banner should indicate Safe Mode / Dormant worker
      const banner = screen.getByTestId("scheduler-operational-banner");
      expect(banner.textContent).toContain("Worker Inactive — Safety Mode");

      // Click Cancel Scheduled Campaign button in the list
      const cancelBtn = container.querySelector(
        `#cancel-campaign-btn-${sampleScheduledCampaign.id}`
      ) as HTMLButtonElement;
      expect(cancelBtn).toBeDefined();
      fireEvent.click(cancelBtn);

      // Cancel Confirmation Dialog should open
      expect(await screen.findByText("Cancel Scheduled Campaign?")).toBeDefined();
      expect(
        screen.getByText(/Are you sure you want to cancel campaign/i)
      ).toBeDefined();

      // Confirm cancellation
      const confirmCancelBtn = container.querySelector(
        "#confirm-cancel-campaign-btn"
      ) as HTMLButtonElement;
      expect(confirmCancelBtn).toBeDefined();
      fireEvent.click(confirmCancelBtn);

      await waitFor(() => {
        expect(apiClient.cancelCampaign).toHaveBeenCalledWith("cmp_scheduled_diwali");
      });
    });
  });
});
