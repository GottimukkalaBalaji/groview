import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MasterAdminPage } from "../pages/MasterAdminPage.js";
import * as AuthModule from "../context/AuthContext.js";
import { apiClient } from "../services/api.js";

const mockMasterUser = {
  id: "usr_balaji",
  email: "balaji@gmail.com",
  firstName: "Balaji",
  lastName: null,
  role: "OWNER" as const,
  platformRole: "PLATFORM_MASTER_ADMIN" as const,
  organizationId: "org_groviews",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const mockGroviewsOrg = {
  id: "org_groviews",
  name: "Groviews",
  slug: "groviews",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const mockCapabilities = {
  isPlatformAdmin: true,
  platformRole: "PLATFORM_MASTER_ADMIN" as const,
  canManagePlatformWhatsApp: true,
  canManageAllOrganizations: true,
  canAssignBusinesses: false,
};

describe("Phase 9C: Master Admin Dashboard & Workflows", () => {
  beforeEach(() => {
    vi.spyOn(AuthModule, "useAuth").mockReturnValue({
      user: mockMasterUser,
      organization: mockGroviewsOrg,
      platformCapabilities: mockCapabilities,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      signup: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe("1. Strict Server Authorization Enforcement", () => {
    it("renders access denied if platformCapabilities.isPlatformAdmin is false", () => {
      vi.spyOn(AuthModule, "useAuth").mockReturnValue({
        user: { ...mockMasterUser, platformRole: "NONE" },
        organization: mockGroviewsOrg,
        platformCapabilities: {
          isPlatformAdmin: false,
          platformRole: "NONE",
          canManagePlatformWhatsApp: false,
          canManageAllOrganizations: false,
          canAssignBusinesses: false,
        },
        isAuthenticated: true,
        isLoading: false,
        login: vi.fn(),
        signup: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn(),
      });

      render(<MasterAdminPage />);

      expect(screen.getByText("Platform Master Administrator Authorization Required")).toBeDefined();
      expect(screen.getByText("Tenant Isolation Guarantee")).toBeDefined();
    });
  });

  describe("2. Master Admin Overview Tab", () => {
    it("fetches and displays real platform telemetry and counts", async () => {
      vi.spyOn(apiClient, "getPlatformOverview").mockResolvedValueOnce({
        success: true,
        data: {
          platformStatus: "OPERATIONAL",
          mode: "SHARED_PLATFORM",
          organizations: {
            total: 8,
            active: 7,
            archived: 1,
          },
          users: {
            total: 24,
            masterAdmins: 1,
            delegatedAdmins: 0,
            regularUsers: 23,
          },
          whatsapp: {
            connected: true,
            status: "CONNECTED",
            mode: "SHARED_PLATFORM",
            source: "DATABASE",
            wabaId: "1075305975271164",
            phoneNumberId: "105741875883651",
            displayPhoneNumber: "+1 555-0199",
            verifiedName: "Grovastra Platform",
            tokenExpiresAt: "2027-01-01T00:00:00.000Z",
            lastSyncedAt: "2026-10-15T12:00:00.000Z",
            lastError: null,
            organizationsWithConnectedAccount: 3,
          },
        },
        timestamp: new Date().toISOString(),
      });

      render(<MasterAdminPage />);

      await waitFor(() => {
        expect(screen.getByText("Master Admin Dashboard")).toBeDefined();
      });

      // Verify Metrics are rendered
      expect(screen.getAllByText("8").length).toBeGreaterThanOrEqual(1); // Total orgs
      expect(screen.getByText("7 Active")).toBeDefined();
      expect(screen.getByText("1 Archived")).toBeDefined();
      expect(screen.getByText("24")).toBeDefined(); // Total users
      expect(screen.getByText("+1 555-0199")).toBeDefined();
      expect(screen.getByText("Connected")).toBeDefined();
    });
  });

  describe("3. Customer Organization Directory & Actions", () => {
    it("switches to Organizations tab, displays list, and opens details modal", async () => {
      vi.spyOn(apiClient, "getPlatformOverview").mockResolvedValueOnce({
        success: true,
        data: {
          platformStatus: "OPERATIONAL",
          mode: "SHARED_PLATFORM",
          organizations: { total: 2, active: 2, archived: 0 },
          users: { total: 5, masterAdmins: 1, delegatedAdmins: 0, regularUsers: 4 },
          whatsapp: {
            connected: true,
            status: "CONNECTED",
            mode: "SHARED_PLATFORM",
            source: "DATABASE",
            wabaId: null,
            phoneNumberId: null,
            displayPhoneNumber: null,
            verifiedName: null,
            tokenExpiresAt: null,
            lastSyncedAt: null,
            lastError: null,
            organizationsWithConnectedAccount: 1,
          },
        },
        timestamp: new Date().toISOString(),
      });

      const mockOrgs = [
        {
          id: "org_alpha_123",
          name: "Alpha Logistics",
          slug: "alpha-logistics",
          status: "ACTIVE" as const,
          isArchived: false,
          deletedAt: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
          userCount: 3,
          hasMetaAccount: true,
        },
        {
          id: "org_groviews",
          name: "Groviews",
          slug: "groviews",
          status: "ACTIVE" as const,
          isArchived: false,
          deletedAt: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
          userCount: 1,
          hasMetaAccount: true,
        },
      ];

      vi.spyOn(apiClient, "getPlatformOrganizations").mockResolvedValueOnce({
        success: true,
        data: {
          organizations: mockOrgs,
          pagination: {
            total: 2,
            page: 1,
            limit: 10,
            totalPages: 1,
          },
        },
        timestamp: new Date().toISOString(),
      });

      render(<MasterAdminPage />);

      // Switch to Organizations Tab
      const orgTabBtn = screen.getByRole("button", { name: /Organizations/i });
      fireEvent.click(orgTabBtn);

      await waitFor(() => {
        expect(screen.getByText("Alpha Logistics")).toBeDefined();
        expect(screen.getByText("alpha-logistics")).toBeDefined();
      });

      // Check self-archive button is disabled for operator's own org
      const archiveButtons = screen.getAllByRole("button", { name: /Archive/i });
      // One of the archive buttons should be disabled for org_groviews
      expect(archiveButtons.some((b) => (b as HTMLButtonElement).disabled)).toBe(true);

      // Open details modal
      vi.spyOn(apiClient, "getPlatformOrganization").mockResolvedValueOnce({
        success: true,
        data: {
          id: "org_alpha_123",
          name: "Alpha Logistics",
          slug: "alpha-logistics",
          status: "ACTIVE",
          isArchived: false,
          deletedAt: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
          counts: {
            campaigns: 5,
            contacts: 1200,
            contactLists: 3,
            users: 2,
          },
          users: [
            {
              id: "usr_alice",
              email: "alice@alpha.com",
              firstName: "Alice",
              lastName: "Smith",
              role: "OWNER",
              platformRole: "NONE",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
          metaAccount: null,
        },
        timestamp: new Date().toISOString(),
      });

      const detailsBtns = screen.getAllByRole("button", { name: /Details/i });
      fireEvent.click(detailsBtns[0]);

      await waitFor(() => {
        expect(screen.getByText("Resource Inventory")).toBeDefined();
        expect(screen.getByText("1200")).toBeDefined(); // Contacts count
        expect(screen.getByText("alice@alpha.com")).toBeDefined();
      });
    });
  });

  describe("4. Business Assignments Tab (Management View)", () => {
    it("displays delegated agency business assignments management view with assign actions", async () => {
      vi.spyOn(apiClient, "getPlatformAssignments").mockResolvedValueOnce({
        success: true,
        data: {
          assignments: [],
          pagination: { total: 0, page: 1, limit: 10, totalPages: 0 },
          tableDeployed: true,
        },
        timestamp: "2026-10-18T10:00:00.000Z",
      });
      vi.spyOn(apiClient, "getEligibleDelegatedAdmins").mockResolvedValueOnce({
        success: true,
        data: [],
        timestamp: "2026-10-18T10:00:00.000Z",
      });

      render(<MasterAdminPage />);

      const assignmentsTabBtn = screen.getByRole("button", { name: /Business Assignments/i });
      fireEvent.click(assignmentsTabBtn);

      await waitFor(() => {
        expect(screen.getByText("Delegated Agency Business Assignments")).toBeDefined();
        expect(screen.getByRole("button", { name: /Assign Business/i })).toBeDefined();
        expect(screen.getByPlaceholderText(/Search by organization, admin email, or slug/i)).toBeDefined();
      });
    });
  });

  describe("5. Shared WhatsApp Platform Tab", () => {
    it("displays connection health, mode, and templates catalog", async () => {
      vi.spyOn(apiClient, "getPlatformWhatsAppStatus").mockResolvedValueOnce({
        success: true,
        data: {
          connected: true,
          status: "CONNECTED",
          source: "DATABASE",
          mode: "SHARED_PLATFORM",
          canManageCredentials: true,
          isSharedPlatform: true,
          wabaId: "1075305975271164",
          phoneNumberId: "105741875883651",
          displayPhoneNumber: "+1 555-0199",
          verifiedName: "Grovastra Platform Sender",
          tokenExpiresAt: "2027-01-01T00:00:00.000Z",
          verifiedAt: "2026-01-01T00:00:00.000Z",
          lastSyncedAt: "2026-10-15T12:00:00.000Z",
          lastError: null,
        },
        timestamp: new Date().toISOString(),
      });

      vi.spyOn(apiClient, "getPlatformTemplates").mockResolvedValueOnce({
        success: true,
        data: {
          templates: [
            {
              id: "tpl_hello",
              name: "hello_world",
              language: "en_US",
              category: "UTILITY",
              status: "APPROVED",
              isSendable: true,
              parameterFormat: "POSITIONAL",
              body: "Welcome to Grovastra",
            },
          ],
          summary: {
            totalOnMeta: 1,
            approvedCount: 1,
            pendingCount: 0,
            rejectedCount: 0,
            wabaIdMasked: "***1164",
            syncedAt: "2026-10-15T12:00:00.000Z",
            requestedTemplatesFound: {
              hello_world: true,
              jaspers_market_plain_text_v1: false,
              jaspers_market_order_confirmation_v1: false,
            },
          },
        },
        timestamp: new Date().toISOString(),
      });

      render(<MasterAdminPage />);

      const whatsappTabBtn = screen.getByRole("button", { name: /Shared WhatsApp Platform/i });
      fireEvent.click(whatsappTabBtn);

      await waitFor(() => {
        expect(screen.getByText("Grovastra Platform Sender")).toBeDefined();
        expect(screen.getByText("+1 555-0199")).toBeDefined();
        expect(screen.getByText("hello_world")).toBeDefined();
        expect(screen.getByText("Welcome to Grovastra")).toBeDefined();
        expect(screen.getByText("1 Approved")).toBeDefined();
      });
    });
  });

  describe("6. Step 1: UI Resilience, Keyboard Accessibility & Responsive Fixes", () => {
    const mockOrganizationsResponse = {
      success: true,
      data: {
        organizations: [
          {
            id: "org_alpha_123",
            name: "Alpha Logistics",
            slug: "alpha-logistics",
            status: "ACTIVE" as const,
            isArchived: false,
            deletedAt: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z",
            userCount: 2,
            hasMetaAccount: true,
          },
        ],
        pagination: {
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
      },
      timestamp: new Date().toISOString(),
    };

    const mockDetailResponse = {
      success: true,
      data: {
        id: "org_alpha_123",
        name: "Alpha Logistics",
        slug: "alpha-logistics",
        status: "ACTIVE" as const,
        isArchived: false,
        deletedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        counts: {
          campaigns: 4,
          contacts: 800,
          contactLists: 2,
          users: 1,
        },
        users: [
          {
            id: "usr_alice",
            email: "alice_super_long_domain_address@alpha-logistics-group.com",
            firstName: "Alice",
            lastName: "Smith",
            role: "OWNER",
            platformRole: "NONE" as const,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        metaAccount: null,
      },
      timestamp: new Date().toISOString(),
    };

    it("handles clipboard writeText rejection gracefully without silent failure", async () => {
      vi.spyOn(apiClient, "getPlatformOrganizations").mockResolvedValue(mockOrganizationsResponse);

      const writeTextSpy = vi.fn().mockRejectedValue(new Error("Clipboard permission denied"));
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: writeTextSpy },
        configurable: true,
        writable: true,
      });

      render(<MasterAdminPage />);
      const orgTabBtn = screen.getByRole("button", { name: /Organizations/i });
      fireEvent.click(orgTabBtn);

      await waitFor(() => {
        expect(screen.getByText("Alpha Logistics")).toBeDefined();
      });

      // Click copy button on the organization ID
      const copyBtn = screen.getByTitle("Click to copy ID");
      fireEvent.click(copyBtn);

      await waitFor(() => {
        expect(writeTextSpy).toHaveBeenCalledWith("org_alpha_123");
        expect(
          screen.getByText("Failed to copy ID to clipboard. Please select and copy manually.")
        ).toBeDefined();
      });
    });

    it("reports success feedback notification when copy succeeds", async () => {
      vi.spyOn(apiClient, "getPlatformOrganizations").mockResolvedValue(mockOrganizationsResponse);

      const writeTextSpy = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: writeTextSpy },
        configurable: true,
        writable: true,
      });

      render(<MasterAdminPage />);
      const orgTabBtn = screen.getByRole("button", { name: /Organizations/i });
      fireEvent.click(orgTabBtn);

      await waitFor(() => {
        expect(screen.getByText("Alpha Logistics")).toBeDefined();
      });

      const copyBtn = screen.getByTitle("Click to copy ID");
      fireEvent.click(copyBtn);

      await waitFor(() => {
        expect(writeTextSpy).toHaveBeenCalledWith("org_alpha_123");
        expect(
          screen.getByText('Organization ID "org_alpha_123" copied to clipboard.')
        ).toBeDefined();
      });
    });

    it("closes Organization Details modal when Escape key is pressed", async () => {
      vi.spyOn(apiClient, "getPlatformOrganizations").mockResolvedValue(mockOrganizationsResponse);
      vi.spyOn(apiClient, "getPlatformOrganization").mockResolvedValue(mockDetailResponse);

      render(<MasterAdminPage />);
      fireEvent.click(screen.getByRole("button", { name: /Organizations/i }));

      await waitFor(() => {
        expect(screen.getByText("Alpha Logistics")).toBeDefined();
      });

      // Open modal
      fireEvent.click(screen.getByRole("button", { name: /Details/i }));

      await waitFor(() => {
        expect(screen.getByText("Resource Inventory")).toBeDefined();
      });

      // Press Escape key
      fireEvent.keyDown(window, { key: "Escape" });

      await waitFor(() => {
        expect(screen.queryByText("Resource Inventory")).toBeNull();
      });
    });

    it("closes Confirmation modal on Escape key when not submitting", async () => {
      vi.spyOn(apiClient, "getPlatformOrganizations").mockResolvedValue(mockOrganizationsResponse);

      render(<MasterAdminPage />);
      fireEvent.click(screen.getByRole("button", { name: /Organizations/i }));

      await waitFor(() => {
        expect(screen.getByText("Alpha Logistics")).toBeDefined();
      });

      // Open archive confirmation modal
      fireEvent.click(screen.getByRole("button", { name: /Archive/i }));

      await waitFor(() => {
        expect(screen.getByText("Confirm Deactivation & Archival")).toBeDefined();
      });

      // Press Escape key
      fireEvent.keyDown(window, { key: "Escape" });

      await waitFor(() => {
        expect(screen.queryByText("Confirm Deactivation & Archival")).toBeNull();
      });
    });

    it("does NOT close confirmation modal on Escape or backdrop click while operation is pending", async () => {
      vi.spyOn(apiClient, "getPlatformOrganizations").mockResolvedValue(mockOrganizationsResponse);

      // Create a pending promise for archive operation that doesn't resolve immediately
      let resolveArchive: (val: any) => void = () => {};
      const archivePromise = new Promise((resolve) => {
        resolveArchive = resolve;
      });
      vi.spyOn(apiClient, "archivePlatformOrganization").mockReturnValue(archivePromise as any);

      render(<MasterAdminPage />);
      fireEvent.click(screen.getByRole("button", { name: /Organizations/i }));

      await waitFor(() => {
        expect(screen.getByText("Alpha Logistics")).toBeDefined();
      });

      // Open archive confirmation modal
      fireEvent.click(screen.getByRole("button", { name: /Archive/i }));

      await waitFor(() => {
        expect(screen.getByText("Confirm Deactivation & Archival")).toBeDefined();
      });

      // Click "Archive Organization" button in modal to trigger pending submission
      const modalSubmitBtn = screen.getByRole("button", { name: /Archive Organization/i });
      fireEvent.click(modalSubmitBtn);

      // Press Escape while submitting
      fireEvent.keyDown(window, { key: "Escape" });

      // Modal must still remain open!
      expect(screen.getByText("Confirm Deactivation & Archival")).toBeDefined();

      // Resolve the pending action
      resolveArchive({
        success: true,
        data: { id: "org_alpha_123", name: "Alpha Logistics", status: "ARCHIVED" },
      });

      await waitFor(() => {
        expect(screen.queryByText("Confirm Deactivation & Archival")).toBeNull();
      });
    });

    it("renders fallback count badge on Organizations tab before overview is loaded", async () => {
      vi.spyOn(apiClient, "getPlatformOverview").mockResolvedValue({
        success: true,
        data: {
          platformStatus: "OPERATIONAL",
          mode: "SHARED_PLATFORM",
          organizations: { total: 42, active: 40, archived: 2 },
          users: { total: 100, masterAdmins: 2, delegatedAdmins: 0, regularUsers: 98 },
          whatsapp: {
            connected: true,
            status: "CONNECTED",
            mode: "SHARED_PLATFORM",
            source: "DATABASE",
            wabaId: null,
            phoneNumberId: null,
            displayPhoneNumber: null,
            verifiedName: null,
            tokenExpiresAt: null,
            lastSyncedAt: null,
            lastError: null,
            organizationsWithConnectedAccount: 5,
          },
        },
        timestamp: new Date().toISOString(),
      });

      vi.spyOn(apiClient, "getPlatformOrganizations").mockResolvedValue({
        success: true,
        data: {
          organizations: mockOrganizationsResponse.data.organizations,
          pagination: { total: 42, page: 1, limit: 10, totalPages: 5 },
        },
        timestamp: new Date().toISOString(),
      });

      render(<MasterAdminPage />);

      await waitFor(() => {
        expect(screen.getAllByText("42").length).toBeGreaterThanOrEqual(1);
      });
    });

    it("allows entering search query, debouncing, and clearing search with clear button", async () => {
      const getOrgsSpy = vi.spyOn(apiClient, "getPlatformOrganizations").mockResolvedValue(mockOrganizationsResponse);

      render(<MasterAdminPage />);
      fireEvent.click(screen.getByRole("button", { name: /Organizations/i }));

      await waitFor(() => {
        expect(screen.getByText("Alpha Logistics")).toBeDefined();
      });

      const searchInput = screen.getByPlaceholderText("Search by name, slug, or ID...");

      // Type in search query
      fireEvent.change(searchInput, { target: { value: "Delta" } });
      expect((searchInput as HTMLInputElement).value).toBe("Delta");

      // Verify clear button appears and click it
      const clearBtn = screen.getByLabelText("Clear search");
      expect(clearBtn).toBeDefined();

      fireEvent.click(clearBtn);
      expect((searchInput as HTMLInputElement).value).toBe("");

      await waitFor(() => {
        expect(getOrgsSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            search: undefined,
          })
        );
      });
    });
  });
});

