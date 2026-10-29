import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { Header } from "../components/Header.js";
import { AuthProvider, useAuth } from "../context/AuthContext.js";
import { apiClient } from "../services/api.js";
import * as AuthModule from "../context/AuthContext.js";

describe("Phase A1.13: Delegated Admin Company Switching & Header Scoping", () => {
  beforeEach(() => {
    sessionStorage.clear();
    apiClient.setScopedOrganizationId(null);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    sessionStorage.clear();
    apiClient.setScopedOrganizationId(null);
  });

  describe("1. Header Active Company Dropdown Rendering & Access Gate", () => {
    it("does NOT render Active Company selector for regular customer users", () => {
      vi.spyOn(AuthModule, "useAuth").mockReturnValue({
        user: {
          id: "cust_1",
          email: "customer@bakery.com",
          firstName: "Alice",
          lastName: "Customer",
          role: "OWNER",
          organizationId: "org_bakery",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        organization: {
          id: "org_bakery",
          name: "Alice's Bakery",
          slug: "alices-bakery",
        },
        platformCapabilities: {
          isPlatformAdmin: false,
          platformRole: "NONE",
          canManagePlatformWhatsApp: false,
          canManageAllOrganizations: false,
          canAssignBusinesses: false,
        },
        assignedOrganizations: [],
        activeAssignedOrgId: null,
        setActiveAssignedOrgId: vi.fn(),
        refreshAssignedOrganizations: vi.fn(),
        isAuthenticated: true,
        isLoading: false,
        login: vi.fn(),
        signup: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn(),
      });

      render(<Header title="Dashboard" />);

      expect(screen.queryByTestId("delegated-admin-company-selector")).toBeNull();
      expect(screen.queryByTestId("assigned-company-select")).toBeNull();
      expect(screen.getByText("Alice's Bakery")).toBeDefined();
    });

    it("renders Active Company selector with assigned companies for DELEGATED_ADMIN", () => {
      const mockSetActiveOrg = vi.fn();
      const mockAssignedOrgs = [
        { id: "org_alpha", name: "Alpha Retailers", slug: "alpha-retailers" },
        { id: "org_beta", name: "Beta Fashion", slug: "beta-fashion" },
      ];

      vi.spyOn(AuthModule, "useAuth").mockReturnValue({
        user: {
          id: "admin_1",
          email: "admin1@gmail.com",
          firstName: "Admin",
          lastName: "One",
          role: "ADMIN",
          organizationId: "agency_1",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        organization: {
          id: "agency_1",
          name: "Admin 1's Agency",
          slug: "admin-1-agency",
        },
        platformCapabilities: {
          isPlatformAdmin: false,
          platformRole: "DELEGATED_ADMIN",
          canManagePlatformWhatsApp: false,
          canManageAllOrganizations: false,
          canAssignBusinesses: false,
          assignedOrganizationIds: ["org_alpha", "org_beta"],
        },
        assignedOrganizations: mockAssignedOrgs,
        activeAssignedOrgId: "org_alpha",
        setActiveAssignedOrgId: mockSetActiveOrg,
        refreshAssignedOrganizations: vi.fn(),
        isAuthenticated: true,
        isLoading: false,
        login: vi.fn(),
        signup: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn(),
      });

      render(<Header title="Dashboard" />);

      const selectorContainer = screen.getByTestId("delegated-admin-company-selector");
      expect(selectorContainer).toBeDefined();

      const selectDropdown = screen.getByTestId("assigned-company-select") as HTMLSelectElement;
      expect(selectDropdown).toBeDefined();
      expect(selectDropdown.value).toBe("org_alpha");

      expect(screen.getByText("Alpha Retailers")).toBeDefined();
      expect(screen.getByText("Beta Fashion")).toBeDefined();
      expect(screen.getByText("Managing: Alpha Retailers")).toBeDefined();
    });

    it("renders empty state badge when DELEGATED_ADMIN has 0 assigned companies", () => {
      vi.spyOn(AuthModule, "useAuth").mockReturnValue({
        user: {
          id: "admin_1",
          email: "admin1@gmail.com",
          firstName: "Admin",
          lastName: "One",
          role: "ADMIN",
          organizationId: "agency_1",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        organization: {
          id: "agency_1",
          name: "Admin 1's Agency",
          slug: "admin-1-agency",
        },
        platformCapabilities: {
          isPlatformAdmin: false,
          platformRole: "DELEGATED_ADMIN",
          canManagePlatformWhatsApp: false,
          canManageAllOrganizations: false,
          canAssignBusinesses: false,
          assignedOrganizationIds: [],
        },
        assignedOrganizations: [],
        activeAssignedOrgId: null,
        setActiveAssignedOrgId: vi.fn(),
        refreshAssignedOrganizations: vi.fn(),
        isAuthenticated: true,
        isLoading: false,
        login: vi.fn(),
        signup: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn(),
      });

      render(<Header title="Dashboard" />);

      expect(screen.getByTestId("delegated-admin-company-selector")).toBeDefined();
      expect(screen.getByTestId("no-assigned-badge")).toBeDefined();
      expect(screen.getByText("No Businesses Assigned")).toBeDefined();
      expect(screen.queryByTestId("assigned-company-select")).toBeNull();
    });

    it("calls setActiveAssignedOrgId when dropdown selection changes", () => {
      const mockSetActiveOrg = vi.fn();
      const mockAssignedOrgs = [
        { id: "org_alpha", name: "Alpha Retailers", slug: "alpha-retailers" },
        { id: "org_beta", name: "Beta Fashion", slug: "beta-fashion" },
      ];

      vi.spyOn(AuthModule, "useAuth").mockReturnValue({
        user: {
          id: "admin_1",
          email: "admin1@gmail.com",
          firstName: "Admin",
          lastName: "One",
          role: "ADMIN",
          organizationId: "agency_1",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        organization: {
          id: "agency_1",
          name: "Admin 1's Agency",
          slug: "admin-1-agency",
        },
        platformCapabilities: {
          isPlatformAdmin: false,
          platformRole: "DELEGATED_ADMIN",
          canManagePlatformWhatsApp: false,
          canManageAllOrganizations: false,
          canAssignBusinesses: false,
          assignedOrganizationIds: ["org_alpha", "org_beta"],
        },
        assignedOrganizations: mockAssignedOrgs,
        activeAssignedOrgId: "org_alpha",
        setActiveAssignedOrgId: mockSetActiveOrg,
        refreshAssignedOrganizations: vi.fn(),
        isAuthenticated: true,
        isLoading: false,
        login: vi.fn(),
        signup: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn(),
      });

      render(<Header title="Dashboard" />);

      const selectDropdown = screen.getByTestId("assigned-company-select");
      fireEvent.change(selectDropdown, { target: { value: "org_beta" } });

      expect(mockSetActiveOrg).toHaveBeenCalledWith("org_beta");
    });
  });

  describe("2. ApiClient Scoped Organization Header Integration", () => {
    it("attaches x-scoped-organization-id to requests when scopedOrganizationId is set", async () => {
      apiClient.setScopedOrganizationId("org_scoped_target_123");

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      } as Response);

      await apiClient.listCampaigns();

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/campaigns"),
        expect.objectContaining({
          headers: expect.objectContaining({
            "x-scoped-organization-id": "org_scoped_target_123",
          }),
        })
      );
    });

    it("does NOT attach x-scoped-organization-id when scopedOrganizationId is null", async () => {
      apiClient.setScopedOrganizationId(null);

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      } as Response);

      await apiClient.listCampaigns();

      const callHeaders = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
      expect(callHeaders["x-scoped-organization-id"]).toBeUndefined();
    });
  });

  describe("3. AuthContext Assigned Companies Synchronization", () => {
    it("loads assigned organizations and sets active company in ApiClient for DELEGATED_ADMIN", async () => {
      vi.spyOn(apiClient, "getCurrentUser").mockResolvedValueOnce({
        success: true,
        data: {
          user: {
            id: "admin_1",
            email: "admin1@gmail.com",
            firstName: "Admin",
            lastName: "One",
            role: "ADMIN",
            organizationId: "agency_1",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          organization: {
            id: "agency_1",
            name: "Admin 1's Agency",
            slug: "admin-1-agency",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        },
      } as any);

      vi.spyOn(apiClient, "getPlatformCapabilities").mockResolvedValueOnce({
        success: true,
        data: {
          isPlatformAdmin: false,
          platformRole: "DELEGATED_ADMIN",
          canManagePlatformWhatsApp: false,
          canManageAllOrganizations: false,
          canAssignBusinesses: false,
          assignedOrganizationIds: ["org_alpha", "org_beta"],
        },
      } as any);

      vi.spyOn(apiClient, "getMyAssignedOrganizations").mockResolvedValueOnce({
        success: true,
        data: [
          { id: "org_alpha", name: "Alpha Retailers", slug: "alpha-retailers" },
          { id: "org_beta", name: "Beta Fashion", slug: "beta-fashion" },
        ],
      } as any);

      const TestConsumer = () => {
        const { assignedOrganizations, activeAssignedOrgId } = useAuth();
        return (
          <div>
            <span data-testid="orgs-count">{assignedOrganizations?.length ?? 0}</span>
            <span data-testid="active-org">{activeAssignedOrgId}</span>
          </div>
        );
      };

      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("orgs-count").textContent).toBe("2");
        expect(screen.getByTestId("active-org").textContent).toBe("org_alpha");
      });

      // Verify ApiClient received the scoped organization
      expect(apiClient.getScopedOrganizationId()).toBe("org_alpha");
    });

    it("clears scoped organization and storage on logout", async () => {
      vi.spyOn(apiClient, "logout").mockResolvedValueOnce({
        success: true,
        data: { loggedOut: true },
      } as any);

      apiClient.setScopedOrganizationId("org_alpha");
      sessionStorage.setItem("grovastra_active_scoped_org_id", "org_alpha");

      const TestConsumer = () => {
        const { logout } = useAuth();
        return (
          <button data-testid="logout-btn" onClick={() => logout()}>
            Logout
          </button>
        );
      };

      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );

      fireEvent.click(screen.getByTestId("logout-btn"));

      await waitFor(() => {
        expect(apiClient.getScopedOrganizationId()).toBeNull();
        expect(sessionStorage.getItem("grovastra_active_scoped_org_id")).toBeNull();
      });
    });
  });
});
