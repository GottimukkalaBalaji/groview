import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MasterAdminPage } from "../pages/MasterAdminPage.js";
import { apiClient, ApiClientError } from "../services/api.js";

// Mock the AuthContext so the page evaluates as PLATFORM_MASTER_ADMIN
vi.mock("../context/AuthContext.js", () => ({
  useAuth: () => ({
    user: {
      id: "usr_master_balaji",
      email: "balaji@gmail.com",
      firstName: "Balaji",
      lastName: null,
      role: "OWNER",
      platformRole: "PLATFORM_MASTER_ADMIN",
    },
    organization: {
      id: "cmv7xnkn20000t818segbx7xq",
      name: "Groviews",
      slug: "groviews-ee3562",
    },
    platformCapabilities: {
      isPlatformAdmin: true,
      platformRole: "PLATFORM_MASTER_ADMIN",
      canManagePlatformWhatsApp: true,
      canManageAllOrganizations: true,
      canAssignBusinesses: true,
    },
    isLoading: false,
  }),
}));

const mockAssignmentsList = [
  {
    id: "asgn_1",
    organizationId: "org_alpha_123",
    organization: {
      id: "org_alpha_123",
      name: "Alpha Retailers",
      slug: "alpha-retailers",
      isArchived: false,
    },
    userId: "usr_del_1",
    user: {
      id: "usr_del_1",
      email: "dan@agency.com",
      firstName: "Dan",
      lastName: "Agency",
      platformRole: "DELEGATED_ADMIN" as const,
    },
    assignedById: "usr_master_balaji",
    assignedBy: {
      id: "usr_master_balaji",
      email: "balaji@gmail.com",
      firstName: "Balaji",
      lastName: null,
    },
    status: "ACTIVE" as const,
    assignedAt: "2026-10-18T10:00:00.000Z",
    revokedAt: null,
    assignmentReason: "Q4 Marketing campaign operator",
    revocationReason: null,
    createdAt: "2026-10-18T10:00:00.000Z",
    updatedAt: "2026-10-18T10:00:00.000Z",
  },
  {
    id: "asgn_2",
    organizationId: "org_beta_456",
    organization: {
      id: "org_beta_456",
      name: "Beta Healthcare",
      slug: "beta-healthcare",
      isArchived: false,
    },
    userId: "usr_del_2",
    user: {
      id: "usr_del_2",
      email: "sara@agency.com",
      firstName: "Sara",
      lastName: "Partner",
      platformRole: "DELEGATED_ADMIN" as const,
    },
    assignedById: "usr_master_balaji",
    assignedBy: {
      id: "usr_master_balaji",
      email: "balaji@gmail.com",
      firstName: "Balaji",
      lastName: null,
    },
    status: "REVOKED" as const,
    assignedAt: "2026-10-10T10:00:00.000Z",
    revokedAt: "2026-10-15T12:00:00.000Z",
    assignmentReason: "Past operations",
    revocationReason: "Project concluded",
    createdAt: "2026-10-10T10:00:00.000Z",
    updatedAt: "2026-10-15T12:00:00.000Z",
  },
];

const mockEligibleAdmins = [
  {
    id: "usr_del_1",
    email: "dan@agency.com",
    firstName: "Dan",
    lastName: "Agency",
    platformRole: "DELEGATED_ADMIN" as const,
    organizationId: "org_agency_1",
    organizationName: "Agency Partner Org",
  },
  {
    id: "usr_del_2",
    email: "sara@agency.com",
    firstName: "Sara",
    lastName: "Partner",
    platformRole: "DELEGATED_ADMIN" as const,
    organizationId: "org_agency_1",
    organizationName: "Agency Partner Org",
  },
];

const mockOrganizations = {
  organizations: [
    {
      id: "org_alpha_123",
      name: "Alpha Retailers",
      slug: "alpha-retailers",
      status: "ACTIVE" as const,
      isArchived: false,
      deletedAt: null,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
      userCount: 3,
      hasMetaAccount: true,
    },
    {
      id: "org_gamma_789",
      name: "Gamma Logistics",
      slug: "gamma-logistics",
      status: "ACTIVE" as const,
      isArchived: false,
      deletedAt: null,
      createdAt: "2026-10-05T00:00:00.000Z",
      updatedAt: "2026-10-05T00:00:00.000Z",
      userCount: 2,
      hasMetaAccount: false,
    },
  ],
  pagination: { total: 2, page: 1, limit: 10, totalPages: 1 },
};

describe("Step 4 — Master Admin Business Assignments UI", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(apiClient, "getPlatformOverview").mockResolvedValue({
      success: true,
      timestamp: "2026-10-18T10:00:00.000Z",
      data: {
        platformStatus: "OPERATIONAL",
        mode: "SHARED_PLATFORM",
        organizations: { total: 5, active: 5, archived: 0 },
        users: { total: 10, masterAdmins: 1, delegatedAdmins: 2, regularUsers: 7 },
        whatsapp: {
          connected: true,
          status: "CONNECTED",
          mode: "SHARED_PLATFORM",
          source: "SHARED_ACCOUNT",
          wabaId: "1075305975271164",
          phoneNumberId: "1290524220819472",
          displayPhoneNumber: "+1 555-0199",
          verifiedName: "Grovastra Platform",
          tokenExpiresAt: null,
          lastSyncedAt: null,
          lastError: null,
          organizationsWithConnectedAccount: 5,
        },
      },
    });

    vi.spyOn(apiClient, "getPlatformOrganizations").mockResolvedValue({
      success: true,
      timestamp: "2026-10-18T10:00:00.000Z",
      data: mockOrganizations,
    });

    vi.spyOn(apiClient, "getPlatformAssignments").mockResolvedValue({
      success: true,
      timestamp: "2026-10-18T10:00:00.000Z",
      data: {
        assignments: mockAssignmentsList,
        pagination: { total: 2, page: 1, limit: 10, totalPages: 1 },
        tableDeployed: true,
      },
    });

    vi.spyOn(apiClient, "getEligibleDelegatedAdmins").mockResolvedValue({
      success: true,
      timestamp: "2026-10-18T10:00:00.000Z",
      data: mockEligibleAdmins,
    });
  });

  describe("1. Rendering & Tabs", () => {
    it("renders Business Assignments tab with action buttons and filter bar", async () => {
      render(<MasterAdminPage />);

      const tabBtn = screen.getByRole("button", { name: /Business Assignments/i });
      fireEvent.click(tabBtn);

      await waitFor(() => {
        expect(screen.getByText("Delegated Agency Business Assignments")).toBeDefined();
        expect(screen.getByRole("button", { name: "Assign Business" })).toBeDefined();
        expect(screen.getByPlaceholderText(/Search by organization, admin email, or slug/i)).toBeDefined();
        expect(screen.getByText((_, el) => el?.textContent?.trim() === "Total: 2 assignments")).toBeDefined();
      });
    });

    it("displays migration pending notice without fabricating data when tableDeployed is false", async () => {
      vi.spyOn(apiClient, "getPlatformAssignments").mockResolvedValueOnce({
        success: true,
        timestamp: "2026-10-18T10:00:00.000Z",
        data: {
          assignments: [],
          pagination: { total: 0, page: 1, limit: 10, totalPages: 0 },
          tableDeployed: false,
          message: "Business assignments table is pending database migration deployment.",
        },
      });

      render(<MasterAdminPage />);

      const tabBtn = screen.getByRole("button", { name: /Business Assignments/i });
      fireEvent.click(tabBtn);

      await waitFor(() => {
        expect(screen.getByText("Database Migration Pending")).toBeDefined();
        expect(screen.getByText(/Business assignments table is pending database migration deployment/i)).toBeDefined();
        expect(screen.getByText("No business assignments configured")).toBeDefined();
      });
    });
  });

  describe("2. Assignment Table Data Display", () => {
    it("renders assignment rows with organization details, admin info, badges, and revoke button", async () => {
      render(<MasterAdminPage />);

      fireEvent.click(screen.getByRole("button", { name: /Business Assignments/i }));

      await waitFor(() => {
        // Active assignment
        expect(screen.getByText("Alpha Retailers")).toBeDefined();
        expect(screen.getByText("alpha-retailers")).toBeDefined();
        expect(screen.getByText("dan@agency.com")).toBeDefined();
        expect(screen.getByText("Active")).toBeDefined();
        expect(screen.getByRole("button", { name: "Revoke" })).toBeDefined();

        // Revoked assignment
        expect(screen.getByText("Beta Healthcare")).toBeDefined();
        expect(screen.getByText("sara@agency.com")).toBeDefined();
        expect(screen.getByText("Revoked")).toBeDefined();
      });
    });
  });

  describe("3. Assign Business Modal Workflow", () => {
    it("opens Assign Business modal, validates required fields, and submits successfully", async () => {
      const createSpy = vi.spyOn(apiClient, "createPlatformAssignment").mockResolvedValueOnce({
        success: true,
        timestamp: "2026-10-18T10:00:00.000Z",
        data: {
          ...mockAssignmentsList[0],
          id: "asgn_new_99",
          organizationId: "org_gamma_789",
          organization: { id: "org_gamma_789", name: "Gamma Logistics", slug: "gamma-logistics", isArchived: false },
        },
      });

      render(<MasterAdminPage />);

      fireEvent.click(screen.getByRole("button", { name: /Business Assignments/i }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Assign Business" })).not.toBeDisabled();
      });

      // Open modal
      fireEvent.click(screen.getByRole("button", { name: "Assign Business" }));

      await waitFor(() => {
        expect(screen.getByRole("dialog", { name: /Assign Organization to Delegated Administrator/i })).toBeDefined();
      });

      const dialog = screen.getByRole("dialog", { name: /Assign Organization to Delegated Administrator/i });

      // Select target organization
      const orgSelect = within(dialog).getByLabelText(/Target Customer Organization/i);
      fireEvent.change(orgSelect, { target: { value: "org_gamma_789" } });

      // Select delegated admin
      const adminSelect = within(dialog).getByLabelText(/Delegated Administrator/i);
      fireEvent.change(adminSelect, { target: { value: "usr_del_1" } });

      // Enter optional reason
      const reasonInput = within(dialog).getByLabelText(/Assignment Justification \/ Reason/i);
      fireEvent.change(reasonInput, { target: { value: "Operations takeover" } });

      // Submit form inside dialog
      const submitBtn = within(dialog).getByRole("button", { name: "Assign Business" });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(createSpy).toHaveBeenCalledWith({
          organizationId: "org_gamma_789",
          userId: "usr_del_1",
          assignmentReason: "Operations takeover",
        });
        expect(screen.getByText(/Successfully assigned organization 'Gamma Logistics'/i)).toBeDefined();
      });
    });

    it("displays sanitized error message if creation fails with conflict or server error", async () => {
      vi.spyOn(apiClient, "createPlatformAssignment").mockRejectedValueOnce(
        new Error("Organization 'Alpha Retailers' already has an active delegated administrator assignment.")
      );

      render(<MasterAdminPage />);

      fireEvent.click(screen.getByRole("button", { name: /Business Assignments/i }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Assign Business" })).not.toBeDisabled();
      });

      fireEvent.click(screen.getByRole("button", { name: "Assign Business" }));

      await waitFor(() => {
        expect(screen.getByRole("dialog", { name: /Assign Organization to Delegated Administrator/i })).toBeDefined();
      });

      const dialog = screen.getByRole("dialog", { name: /Assign Organization to Delegated Administrator/i });

      const orgSelect = within(dialog).getByLabelText(/Target Customer Organization/i);
      fireEvent.change(orgSelect, { target: { value: "org_alpha_123" } });

      const adminSelect = within(dialog).getByLabelText(/Delegated Administrator/i);
      fireEvent.change(adminSelect, { target: { value: "usr_del_2" } });

      const submitBtn = within(dialog).getByRole("button", { name: "Assign Business" });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(
          within(dialog).getByText(/already has an active delegated administrator assignment/i)
        ).toBeDefined();
      });
    });

    it("does not issue API request and displays validation error when no organization is selected", async () => {
      const createSpy = vi.spyOn(apiClient, "createPlatformAssignment");

      render(<MasterAdminPage />);

      fireEvent.click(screen.getByRole("button", { name: /Business Assignments/i }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Assign Business" })).not.toBeDisabled();
      });

      fireEvent.click(screen.getByRole("button", { name: "Assign Business" }));

      await waitFor(() => {
        expect(screen.getByRole("dialog", { name: /Assign Organization to Delegated Administrator/i })).toBeDefined();
      });

      const dialog = screen.getByRole("dialog", { name: /Assign Organization to Delegated Administrator/i });

      // Select admin only, leave organization unselected
      const adminSelect = within(dialog).getByLabelText(/Delegated Administrator/i);
      fireEvent.change(adminSelect, { target: { value: "usr_del_1" } });

      const submitBtn = within(dialog).getByRole("button", { name: "Assign Business" });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(within(dialog).getByText("Please select a target organization.")).toBeDefined();
        expect(createSpy).not.toHaveBeenCalled();
      });
    });

    it("does not issue API request and displays validation error when no delegated admin is selected", async () => {
      const createSpy = vi.spyOn(apiClient, "createPlatformAssignment");

      render(<MasterAdminPage />);

      fireEvent.click(screen.getByRole("button", { name: /Business Assignments/i }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Assign Business" })).not.toBeDisabled();
      });

      fireEvent.click(screen.getByRole("button", { name: "Assign Business" }));

      await waitFor(() => {
        expect(screen.getByRole("dialog", { name: /Assign Organization to Delegated Administrator/i })).toBeDefined();
      });

      const dialog = screen.getByRole("dialog", { name: /Assign Organization to Delegated Administrator/i });

      // Select organization only, leave admin unselected
      const orgSelect = within(dialog).getByLabelText(/Target Customer Organization/i);
      fireEvent.change(orgSelect, { target: { value: "org_alpha_123" } });

      const submitBtn = within(dialog).getByRole("button", { name: "Assign Business" });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(within(dialog).getByText("Please select a delegated administrator.")).toBeDefined();
        expect(createSpy).not.toHaveBeenCalled();
      });
    });

    it("displays structured 422 validation error details cleanly when backend rejects invalid body", async () => {
      vi.spyOn(apiClient, "createPlatformAssignment").mockRejectedValueOnce(
        new ApiClientError("Validation failed", 422, "VALIDATION_ERROR", [
          { field: "organizationId", message: "Organization ID is required" },
        ])
      );

      render(<MasterAdminPage />);

      fireEvent.click(screen.getByRole("button", { name: /Business Assignments/i }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Assign Business" })).not.toBeDisabled();
      });

      fireEvent.click(screen.getByRole("button", { name: "Assign Business" }));

      await waitFor(() => {
        expect(screen.getByRole("dialog", { name: /Assign Organization to Delegated Administrator/i })).toBeDefined();
      });

      const dialog = screen.getByRole("dialog", { name: /Assign Organization to Delegated Administrator/i });

      const orgSelect = within(dialog).getByLabelText(/Target Customer Organization/i);
      fireEvent.change(orgSelect, { target: { value: "org_alpha_123" } });

      const adminSelect = within(dialog).getByLabelText(/Delegated Administrator/i);
      fireEvent.change(adminSelect, { target: { value: "usr_del_1" } });

      const submitBtn = within(dialog).getByRole("button", { name: "Assign Business" });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(within(dialog).getByText("Organization ID is required")).toBeDefined();
      });
    });

    it("clears stale validation/API error banner when selected organization changes", async () => {
      const createSpy = vi.spyOn(apiClient, "createPlatformAssignment").mockRejectedValueOnce(
        new ApiClientError("Validation failed", 422, "VALIDATION_ERROR", [
          { field: "organizationId", message: "Organization ID is required" },
        ])
      );

      render(<MasterAdminPage />);

      fireEvent.click(screen.getByRole("button", { name: /Business Assignments/i }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Assign Business" })).not.toBeDisabled();
      });

      fireEvent.click(screen.getByRole("button", { name: "Assign Business" }));

      await waitFor(() => {
        expect(screen.getByRole("dialog", { name: /Assign Organization to Delegated Administrator/i })).toBeDefined();
      });

      const dialog = screen.getByRole("dialog", { name: /Assign Organization to Delegated Administrator/i });

      const orgSelect = within(dialog).getByLabelText(/Target Customer Organization/i) as HTMLSelectElement;
      fireEvent.change(orgSelect, { target: { value: "org_alpha_123" } });

      const adminSelect = within(dialog).getByLabelText(/Delegated Administrator/i) as HTMLSelectElement;
      fireEvent.change(adminSelect, { target: { value: "usr_del_1" } });

      const submitBtn = within(dialog).getByRole("button", { name: "Assign Business" });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(within(dialog).getByText("Organization ID is required")).toBeDefined();
      });

      // Change organization selection: stale error banner must disappear immediately
      fireEvent.change(orgSelect, { target: { value: "org_gamma_789" } });
      expect(within(dialog).queryByText("Organization ID is required")).toBeNull();
      expect(orgSelect.value).toBe("org_gamma_789");

      // Verify valid selection submits properly with correct organizationId and userId
      createSpy.mockResolvedValueOnce({
        success: true,
        timestamp: "2026-10-18T10:00:00.000Z",
        data: {
          ...mockAssignmentsList[0],
          id: "asgn_new_101",
          organizationId: "org_gamma_789",
          userId: "usr_del_1",
        },
      });

      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(createSpy).toHaveBeenCalledWith({
          organizationId: "org_gamma_789",
          userId: "usr_del_1",
          assignmentReason: undefined,
        });
      });
    });

    it("clears error banner when delegated administrator dropdown changes", async () => {
      render(<MasterAdminPage />);

      fireEvent.click(screen.getByRole("button", { name: /Business Assignments/i }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Assign Business" })).not.toBeDisabled();
      });

      fireEvent.click(screen.getByRole("button", { name: "Assign Business" }));

      await waitFor(() => {
        expect(screen.getByRole("dialog", { name: /Assign Organization to Delegated Administrator/i })).toBeDefined();
      });

      const dialog = screen.getByRole("dialog", { name: /Assign Organization to Delegated Administrator/i });

      // Trigger client validation error by leaving admin unselected
      const orgSelect = within(dialog).getByLabelText(/Target Customer Organization/i) as HTMLSelectElement;
      fireEvent.change(orgSelect, { target: { value: "org_alpha_123" } });

      const submitBtn = within(dialog).getByRole("button", { name: "Assign Business" });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(within(dialog).getByText("Please select a delegated administrator.")).toBeDefined();
      });

      // Changing admin selection clears the error banner
      const adminSelect = within(dialog).getByLabelText(/Delegated Administrator/i) as HTMLSelectElement;
      fireEvent.change(adminSelect, { target: { value: "usr_del_2" } });

      expect(within(dialog).queryByText("Please select a delegated administrator.")).toBeNull();
      expect(adminSelect.value).toBe("usr_del_2");
    });
  });

  describe("4. Revoke Assignment Modal Workflow", () => {
    it("opens Revoke confirmation modal and submits revocation successfully", async () => {
      const revokeSpy = vi.spyOn(apiClient, "revokePlatformAssignment").mockResolvedValueOnce({
        success: true,
        timestamp: "2026-10-18T10:00:00.000Z",
        data: {
          ...mockAssignmentsList[0],
          status: "REVOKED",
          revokedAt: "2026-10-19T00:00:00.000Z",
        },
      });

      render(<MasterAdminPage />);

      fireEvent.click(screen.getByRole("button", { name: /Business Assignments/i }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Revoke" })).toBeDefined();
      });

      // Click Revoke button on active assignment
      fireEvent.click(screen.getByRole("button", { name: "Revoke" }));

      await waitFor(() => {
        expect(screen.getByRole("dialog", { name: /Revoke Business Assignment/i })).toBeDefined();
      });

      const dialog = screen.getByRole("dialog", { name: /Revoke Business Assignment/i });
      expect(within(dialog).getByText(/You are about to revoke delegated administrator access for organization/i)).toBeDefined();

      // Enter optional revocation reason
      const reasonInput = within(dialog).getByLabelText(/Reason for Revocation/i);
      fireEvent.change(reasonInput, { target: { value: "Contract completed" } });

      // Click confirm revoke
      const confirmBtn = within(dialog).getByRole("button", { name: "Confirm Revoke" });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(revokeSpy).toHaveBeenCalledWith("asgn_1", {
          revocationReason: "Contract completed",
        });
        expect(screen.getByText(/Successfully revoked assignment for organization 'Alpha Retailers'/i)).toBeDefined();
      });
    });
  });

  describe("5. Keyboard Accessibility", () => {
    it("closes Assign Business modal on Escape key press", async () => {
      render(<MasterAdminPage />);

      fireEvent.click(screen.getByRole("button", { name: /Business Assignments/i }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Assign Business" })).not.toBeDisabled();
      });

      fireEvent.click(screen.getByRole("button", { name: "Assign Business" }));

      await waitFor(() => {
        expect(screen.getByRole("dialog", { name: /Assign Organization to Delegated Administrator/i })).toBeDefined();
      });

      // Press Escape
      fireEvent.keyDown(window, { key: "Escape" });

      await waitFor(() => {
        expect(screen.queryByRole("dialog", { name: /Assign Organization to Delegated Administrator/i })).toBeNull();
      });
    });
  });
});

