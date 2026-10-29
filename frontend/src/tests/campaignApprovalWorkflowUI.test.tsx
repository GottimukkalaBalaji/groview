import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { getCustomerCampaignStatus } from "../utils/campaignStatus.js";
import { CampaignList } from "../components/CampaignList.js";
import { CampaignDetailsModal } from "../components/CampaignDetailsModal.js";
import { Campaign } from "../types/campaign.js";
import { apiClient } from "../services/api.js";
import { AuthContext } from "../context/AuthContext.js";

// Mock API client
vi.mock("../services/api.js", () => {
  return {
    apiClient: {
      getCampaign: vi.fn(),
      getCampaignMessages: vi.fn().mockResolvedValue({ success: true, data: { items: [], total: 0 } }),
      approveCampaign: vi.fn(),
      rejectCampaign: vi.fn(),
    },
  };
});

describe("Phase A1.14: Campaign Approval Workflow UI Tests", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const pendingCampaign: Campaign = {
    id: "cmp_pending_01",
    organizationId: "org_customer_01",
    name: "Black Friday Mega Sale",
    description: "Scheduled holiday promotional blast",
    status: "DRAFT",
    approvalStatus: "PENDING",
    templateId: "tpl_promo",
    templateName: "holiday_promo",
    templateLanguage: "en_US",
    templateCategory: "MARKETING",
    variablesMapping: {},
    audienceType: "CONTACT_LIST",
    audienceId: "aud_01",
    audienceName: "VIP Buyers",
    totalRecipients: 50,
    scheduledAt: new Date(Date.now() + 86400000).toISOString(),
    startedAt: null,
    completedAt: null,
    createdBy: "cust_user",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const rejectedCampaign: Campaign = {
    ...pendingCampaign,
    id: "cmp_rejected_01",
    name: "Midnight Flash Promo",
    approvalStatus: "REJECTED",
    rejectionReason: "Scheduled time is 2:00 AM off-hours. Please choose daytime.",
    rejectedAt: new Date().toISOString(),
    rejectedBy: "admin_reviewer",
  };

  const approvedCampaign: Campaign = {
    ...pendingCampaign,
    id: "cmp_approved_01",
    name: "Weekend Special Deals",
    status: "SCHEDULED",
    approvalStatus: "APPROVED",
    approvedAt: new Date().toISOString(),
    approvedBy: "admin_reviewer",
    approvalNotes: "Verified promo content and timing",
  };

  describe("1. getCustomerCampaignStatus pure status mappings", () => {
    it("maps PENDING approval to 'Pending Admin Approval'", () => {
      const status = getCustomerCampaignStatus(pendingCampaign);
      expect(status.label).toBe("Pending Admin Approval");
      expect(status.isOverdue).toBe(false);
      expect(status.badgeClass).toContain("bg-amber-500/10");
      expect(status.helperText).toContain("Awaiting admin approval");
    });

    it("maps REJECTED approval to 'Changes Requested' with reason in helperText", () => {
      const status = getCustomerCampaignStatus(rejectedCampaign);
      expect(status.label).toBe("Changes Requested");
      expect(status.isOverdue).toBe(false);
      expect(status.badgeClass).toContain("bg-rose-500/10");
      expect(status.helperText).toContain("Scheduled time is 2:00 AM");
    });

    it("maps APPROVED status with future schedule to 'Scheduled'", () => {
      const status = getCustomerCampaignStatus(approvedCampaign);
      expect(status.label).toBe("Scheduled");
      expect(status.isOverdue).toBe(false);
    });
  });

  describe("2. CampaignList approval status presentation & safety", () => {
    it("renders Pending Admin Approval badge and suppresses launch button for pending campaign", () => {
      const onLaunch = vi.fn();
      render(
        <CampaignList
          campaigns={[pendingCampaign]}
          metrics={{ total: 1, draft: 1, scheduled: 0, sending: 0, completed: 0, failed: 0, cancelled: 0 }}
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
          onLaunchCampaign={onLaunch}
          onRetryQueue={vi.fn()}
          onEditCampaign={vi.fn()}
        />
      );

      expect(screen.getAllByText("Pending Admin Approval").length).toBeGreaterThanOrEqual(1);
      // Launch button must be hidden for pending campaign
      expect(screen.queryByRole("button", { name: `Launch ${pendingCampaign.name}` })).toBeNull();
    });

    it("renders Changes Requested badge for rejected campaign", () => {
      const onEdit = vi.fn();
      render(
        <CampaignList
          campaigns={[rejectedCampaign]}
          metrics={{ total: 1, draft: 1, scheduled: 0, sending: 0, completed: 0, failed: 0, cancelled: 0 }}
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
        />
      );

      expect(screen.getAllByText("Changes Requested").length).toBeGreaterThanOrEqual(1);
      // Launch button is hidden for rejected campaign until edited
      expect(screen.queryByRole("button", { name: `Launch ${rejectedCampaign.name}` })).toBeNull();
    });
  });

  describe("3. CampaignDetailsModal approval banners and reviewer actions", () => {
    it("renders rejection banner and reason for customer", () => {
      render(
        <CampaignDetailsModal
          isOpen={true}
          campaign={rejectedCampaign}
          onClose={vi.fn()}
          onEdit={vi.fn()}
        />
      );

      expect(screen.getByText("Campaign Changes Requested by Reviewer")).toBeDefined();
      expect(screen.getByText(/Scheduled time is 2:00 AM off-hours/)).toBeDefined();
      expect(screen.getByRole("button", { name: /Edit & Resubmit/i })).toBeDefined();
    });

    it("renders reviewer Approve and Reject buttons for DELEGATED_ADMIN", async () => {
      const mockAuthValue: any = {
        user: { id: "admin_user_01", email: "admin@agency.com", role: "DELEGATED_ADMIN" },
        organization: { id: "org_agency" },
        platformCapabilities: {
          platformRole: "DELEGATED_ADMIN",
          isPlatformAdmin: true,
          canManageAdmins: false,
          canAssignBusinesses: false,
          canManageAllBusinesses: false,
          canViewAllBusinesses: false,
        },
        isAuthenticated: true,
        isLoading: false,
      };

      const onUpdated = vi.fn();
      render(
        <AuthContext.Provider value={mockAuthValue}>
          <CampaignDetailsModal
            isOpen={true}
            campaign={pendingCampaign}
            onClose={vi.fn()}
            onCampaignUpdated={onUpdated}
          />
        </AuthContext.Provider>
      );

      expect(screen.getByText("Awaiting Administrator Approval")).toBeDefined();
      const approveBtn = screen.getByRole("button", { name: /Approve Campaign/i });
      const rejectBtn = screen.getByRole("button", { name: /Reject Campaign/i });
      expect(approveBtn).toBeDefined();
      expect(rejectBtn).toBeDefined();

      // Click Approve -> opens confirmation dialog
      fireEvent.click(approveBtn);
      expect(screen.getByText("Confirm Approval")).toBeDefined();

      // Submit approval
      vi.mocked(apiClient.approveCampaign).mockResolvedValueOnce({
        success: true,
        data: { ...approvedCampaign },
      } as any);

      fireEvent.click(screen.getByText("Confirm Approval"));

      await waitFor(() => {
        expect(apiClient.approveCampaign).toHaveBeenCalledWith(pendingCampaign.id, undefined);
      });
    });

    it("requires reason of at least 3 characters when rejecting", async () => {
      const mockAuthValue: any = {
        user: { id: "admin_user_01", email: "admin@agency.com", role: "PLATFORM_MASTER_ADMIN" },
        organization: { id: "org_master" },
        platformCapabilities: {
          platformRole: "PLATFORM_MASTER_ADMIN",
          isPlatformAdmin: true,
          canManageAdmins: true,
          canAssignBusinesses: true,
          canManageAllBusinesses: true,
          canViewAllBusinesses: true,
        },
        isAuthenticated: true,
        isLoading: false,
      };

      render(
        <AuthContext.Provider value={mockAuthValue}>
          <CampaignDetailsModal
            isOpen={true}
            campaign={pendingCampaign}
            onClose={vi.fn()}
          />
        </AuthContext.Provider>
      );

      const rejectBtn = screen.getByRole("button", { name: /Reject Campaign/i });
      fireEvent.click(rejectBtn);

      const confirmRejectBtn = screen.getByRole("button", { name: /Confirm Rejection/i }) as HTMLButtonElement;
      // Button is disabled when reason is empty
      expect(confirmRejectBtn.disabled).toBe(true);

      const textarea = screen.getByPlaceholderText(/Scheduled time falls outside/i);
      fireEvent.change(textarea, { target: { value: "Please choose morning" } });

      expect(confirmRejectBtn.disabled).toBe(false);

      vi.mocked(apiClient.rejectCampaign).mockResolvedValueOnce({
        success: true,
        data: { ...rejectedCampaign },
      } as any);

      fireEvent.click(confirmRejectBtn);

      await waitFor(() => {
        expect(apiClient.rejectCampaign).toHaveBeenCalledWith(pendingCampaign.id, "Please choose morning");
      });
    });
  });
});
