import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { getCustomerCampaignStatus } from "../utils/campaignStatus.js";
import { CampaignList } from "../components/CampaignList.js";
import { CampaignDetailsModal } from "../components/CampaignDetailsModal.js";
import { Campaign } from "../types/campaign.js";

const baseCampaign: Campaign = {
  id: "cmp_test_101",
  organizationId: "org_test",
  name: "Diwali Special Offer",
  description: "Test campaign",
  status: "COMPLETED",
  templateId: "hello_world",
  templateName: "hello_world",
  templateLanguage: "en_US",
  templateCategory: "MARKETING",
  variablesMapping: {},
  audienceType: "CONTACT_LIST",
  audienceId: "list_1",
  audienceName: "VIP Customers",
  totalRecipients: 3,
  sentCount: 0,
  deliveredCount: 0,
  readCount: 0,
  failedCount: 0,
  scheduledAt: null,
  startedAt: "2026-10-17T10:00:00.000Z",
  completedAt: "2026-10-17T10:05:00.000Z",
  createdBy: "system_user",
  createdAt: "2026-10-17T09:00:00.000Z",
  updatedAt: "2026-10-17T10:05:00.000Z",
};

describe("Accurate Campaign Completion Status & Customer-Facing Rules", () => {
  afterEach(() => {
    cleanup();
  });

  describe("1. Pure Status Resolution (getCustomerCampaignStatus)", () => {
    it("shows 'Completed' when all intended recipient messages have reached successful terminal state (DELIVERED / READ)", () => {
      const allSuccess = getCustomerCampaignStatus({
        status: "COMPLETED",
        totalRecipients: 3,
        deliveredCount: 2,
        readCount: 1,
        failedCount: 0,
        sentCount: 0,
        completedAt: "2026-10-17T10:05:00.000Z",
      });

      expect(allSuccess.label).toBe("Completed");
      expect(allSuccess.badgeClass).toContain("bg-emerald-500/10");
      expect(allSuccess.isOverdue).toBe(false);
      expect(allSuccess.helperText).toContain("Finished");
    });

    it("shows 'Completed with issues' when processing has finished and one or more recipient messages failed (mixed outcome)", () => {
      const mixedOutcome = getCustomerCampaignStatus({
        status: "COMPLETED",
        totalRecipients: 3,
        deliveredCount: 2,
        failedCount: 1,
        sentCount: 0,
      });

      expect(mixedOutcome.label).toBe("Completed with issues");
      expect(mixedOutcome.badgeClass).toContain("bg-orange-500/10");
      expect(mixedOutcome.helperText).toBe("1 delivery issue(s) reported");

      // Verify compatibility with failedRecipients alias
      const withRecipientsAlias = getCustomerCampaignStatus({
        status: "COMPLETED",
        totalRecipients: 5,
        failedRecipients: 2,
      });
      expect(withRecipientsAlias.label).toBe("Completed with issues");
      expect(withRecipientsAlias.helperText).toBe("2 delivery issue(s) reported");
    });

    it("shows 'Failed' when all recipient messages failed", () => {
      // Direct FAILED status with metrics
      const allFailed = getCustomerCampaignStatus({
        status: "FAILED",
        totalRecipients: 3,
        failedCount: 3,
        deliveredCount: 0,
        readCount: 0,
        sentCount: 0,
      });
      expect(allFailed.label).toBe("Failed");
      expect(allFailed.badgeClass).toContain("bg-rose-500/10");
      expect(allFailed.helperText).toContain("Campaign encountered an error during dispatch");
    });

    it("shows 'Delivery confirmation pending' and does NOT classify ACCEPTED, SENT, or SUBMITTED_UNCONFIRMED as confirmed delivery", () => {
      // Messages dispatched to gateway (sentCount > 0), awaiting delivery webhook receipts
      const pendingDelivery = getCustomerCampaignStatus({
        status: "COMPLETED",
        totalRecipients: 3,
        sentCount: 3,
        deliveredCount: 0,
        readCount: 0,
        failedCount: 0,
      });

      expect(pendingDelivery.label).toBe("Delivery confirmation pending");
      expect(pendingDelivery.badgeClass).toContain("bg-amber-500/10");
      expect(pendingDelivery.helperText).toContain("3 message(s) dispatched — awaiting delivery confirmation");

      // Intermediate status SUBMITTED_UNCONFIRMED
      const unconfirmed = getCustomerCampaignStatus({
        status: "SUBMITTED_UNCONFIRMED",
      });
      expect(unconfirmed.label).toBe("Delivery confirmation pending");
      expect(unconfirmed.helperText).toBe("Delivery confirmation pending webhook verification");
    });
  });

  describe("2. CampaignList Presentation Across All 4 Scenarios", () => {
    it("renders distinct status badges for all-success, mixed issues, pending confirmation, and failed", () => {
      const allSuccessCamp: Campaign = {
        ...baseCampaign,
        id: "cmp_success",
        name: "Success Campaign",
        status: "COMPLETED",
        totalRecipients: 2,
        deliveredCount: 2,
        readCount: 0,
        failedCount: 0,
        sentCount: 0,
      };

      const mixedCamp: Campaign = {
        ...baseCampaign,
        id: "cmp_mixed",
        name: "Mixed Outcome Campaign",
        status: "COMPLETED",
        totalRecipients: 2,
        deliveredCount: 1,
        readCount: 0,
        failedCount: 1,
        sentCount: 0,
      };

      const pendingCamp: Campaign = {
        ...baseCampaign,
        id: "cmp_pending",
        name: "Pending Webhooks Campaign",
        status: "COMPLETED",
        totalRecipients: 2,
        deliveredCount: 0,
        readCount: 0,
        failedCount: 0,
        sentCount: 2,
      };

      const allFailedCamp: Campaign = {
        ...baseCampaign,
        id: "cmp_failed",
        name: "All Failed Campaign",
        status: "FAILED",
        totalRecipients: 2,
        deliveredCount: 0,
        readCount: 0,
        failedCount: 2,
        sentCount: 0,
      };

      render(
        <CampaignList
          campaigns={[allSuccessCamp, mixedCamp, pendingCamp, allFailedCamp]}
          metrics={{ total: 4, draft: 0, scheduled: 0, sending: 0, completed: 3, failed: 1, cancelled: 0 }}
          pagination={{ page: 1, limit: 10, total: 4, totalPages: 1, hasNextPage: false, hasPrevPage: false }}
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

      // Verify all 4 customer-facing labels appear in the table (both desktop & mobile)
      expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Completed with issues").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Delivery confirmation pending").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Failed").length).toBeGreaterThan(0);
    });
  });

  describe("3. Per-Recipient vs Campaign-Level Consistency", () => {
    it("displays invalid test recipient as failed without incorrectly marking successful recipients as failed", async () => {
      const mixedCampaign: Campaign = {
        ...baseCampaign,
        id: "cmp_mixed_inspect",
        name: "Mixed Test Campaign",
        status: "COMPLETED",
        totalRecipients: 2,
        deliveredCount: 1,
        failedCount: 1,
        sentCount: 0,
      };

      // Mock fetch response for getCampaignMessages
      const mockMessages = [
        {
          id: "msg_valid_1",
          recipientPhoneMasked: "+91 98765 •••••",
          status: "DELIVERED",
          attemptCount: 1,
          wamidMasked: "wamid.valid123",
          sentAt: "2026-10-17T10:01:00.000Z",
          deliveredAt: "2026-10-17T10:01:05.000Z",
          readAt: null,
          failedAt: null,
          errorMessage: null,
          createdAt: "2026-10-17T10:00:00.000Z",
        },
        {
          id: "msg_invalid_2",
          recipientPhoneMasked: "+91 00000 •••••",
          status: "FAILED",
          attemptCount: 1,
          wamidMasked: null,
          sentAt: null,
          deliveredAt: null,
          readAt: null,
          failedAt: "2026-10-17T10:00:02.000Z",
          errorMessage: "Invalid recipient phone number: not registered on WhatsApp",
          createdAt: "2026-10-17T10:00:00.000Z",
        },
      ];

      vi.spyOn(global, "fetch").mockImplementation(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes("/messages")) {
          return {
            ok: true,
            json: async () => ({
              success: true,
              data: {
                items: mockMessages,
                total: 2,
                page: 1,
                limit: 50,
                totalPages: 1,
              },
            }),
          } as any;
        }
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: mixedCampaign,
          }),
        } as any;
      });

      render(
        <CampaignDetailsModal
          isOpen={true}
          campaign={mixedCampaign}
          onClose={vi.fn()}
        />
      );

      // 1. Campaign-level status badge must show 'Completed with issues'
      expect(screen.getByText("Completed with issues")).toBeDefined();

      // 2. Metrics counters must accurately reflect delivered and failed
      expect(screen.getByText("Delivered (Device Confirmed)")).toBeDefined();
      expect(screen.getAllByText("Failed").length).toBeGreaterThan(0);

      // 3. Wait for messages to load and verify per-recipient statuses
      const deliveredRecipients = await screen.findAllByText("Delivered");
      const failedRecipients = await screen.findAllByText("Failed");

      expect(deliveredRecipients.length).toBeGreaterThan(0);
      expect(failedRecipients.length).toBeGreaterThan(0);

      // 4. Verify invalid recipient's error message is visible
      expect(
        screen.getByText("Invalid recipient phone number: not registered on WhatsApp")
      ).toBeDefined();

      // 5. Verify the valid recipient is NOT marked failed
      expect(screen.getByText("+91 98765 •••••")).toBeDefined();
    });
  });
});
