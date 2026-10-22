import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, act, renderHook } from "@testing-library/react";
import { MasterAdminPage } from "../pages/MasterAdminPage.js";
import { Sidebar } from "../components/Sidebar.js";
import * as AuthModule from "../context/AuthContext.js";
import { apiClient } from "../services/api.js";

describe("Phase 9A: Master Admin Authorization & Navigation Shell", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe("1. Customer Role Isolation in Navigation", () => {
    it("does NOT render Master Admin navigation item for ordinary customer OWNER", () => {
      const handleNavigate = vi.fn();

      render(
        <Sidebar
          currentView="dashboard"
          onNavigate={handleNavigate}
          canAccessMasterAdmin={false}
        />
      );

      expect(screen.queryByText("Master Admin")).toBeNull();
      expect(screen.getByText("Dashboard")).toBeDefined();
      expect(screen.getByText("Campaigns")).toBeDefined();
      expect(screen.getByText("Audiences")).toBeDefined();
      expect(screen.getByText("Settings")).toBeDefined();
    });

    it("renders Master Admin navigation item only when canAccessMasterAdmin is verified true", () => {
      const handleNavigate = vi.fn();

      render(
        <Sidebar
          currentView="dashboard"
          onNavigate={handleNavigate}
          canAccessMasterAdmin={true}
        />
      );

      expect(screen.getByText("Master Admin")).toBeDefined();
      expect(screen.getByText("Platform")).toBeDefined();
    });
  });

  describe("2. MasterAdminPage Strict Access Gate", () => {
    it("renders Access Denied state for ordinary customer OWNER", () => {
      vi.spyOn(AuthModule, "useAuth").mockReturnValue({
        user: {
          id: "usr_customer_1",
          email: "owner@brandstore.com",
          firstName: "John",
          lastName: "Doe",
          role: "OWNER",
          organizationId: "org_customer_1",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        organization: {
          id: "org_customer_1",
          name: "BrandStore Retail",
          slug: "brandstore-retail",
        },
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

      expect(
        screen.getByText("Platform Master Administrator Authorization Required")
      ).toBeDefined();
      expect(
        screen.getByText(/Your active authenticated role is/i)
      ).toBeDefined();
      expect(
        screen.getByText(/Customer organization roles \(OWNER, ADMIN, MEMBER\) are strictly tenant-isolated/i)
      ).toBeDefined();
      // Ensure platform operational modules are NOT rendered
      expect(screen.queryByText("Global management shell for customer organizations")).toBeNull();
    });

    it("renders Master Admin operations shell when caller has verified platform admin capability", () => {
      vi.spyOn(AuthModule, "useAuth").mockReturnValue({
        user: {
          id: "usr_platform_operator_1",
          email: "operator@grovastra.com",
          firstName: "Platform",
          lastName: "Operator",
          role: "OWNER",
          organizationId: "cmv7xnkn20000t818segbx7xq",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        organization: {
          id: "cmv7xnkn20000t818segbx7xq",
          name: "Groviews Platform",
          slug: "groviews",
        },
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

      render(<MasterAdminPage />);

      expect(screen.getByText("Master Admin Dashboard")).toBeDefined();
      expect(screen.getByText("PLATFORM_MASTER_ADMIN")).toBeDefined();
      expect(screen.getByText("Organizations")).toBeDefined();
      expect(screen.getByText("Business Assignments")).toBeDefined();
      expect(screen.getByText("Shared WhatsApp Platform")).toBeDefined();
      expect(screen.queryByText("Platform Master Administrator Authorization Required")).toBeNull();
    });
  });

  describe("3. AuthContext Platform Capabilities Lifecycle", () => {
    it("fetches and preserves Master Admin platform capabilities on login", async () => {
      vi.spyOn(apiClient, "getCurrentUser").mockResolvedValue({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Not logged in" },
      } as any);
      vi.spyOn(apiClient, "getPlatformCapabilities").mockResolvedValue({
        success: true,
        data: {
          isPlatformAdmin: false,
          platformRole: "NONE",
          canManagePlatformWhatsApp: false,
          canManageAllOrganizations: false,
          canAssignBusinesses: false,
        },
      } as any);

      const { result } = renderHook(() => AuthModule.useAuth(), {
        wrapper: AuthModule.AuthProvider,
      });

      await act(async () => {
        await Promise.resolve();
      });

      // Initially unauthenticated
      expect(result.current.user).toBeNull();
      expect(result.current.platformCapabilities?.isPlatformAdmin || false).toBe(false);

      vi.spyOn(apiClient, "login").mockResolvedValue({
        success: true,
        data: {
          user: {
            id: "usr_master_1",
            email: "balaji@gmail.com",
            firstName: "Balaji",
            lastName: null,
            role: "OWNER",
            platformRole: "PLATFORM_MASTER_ADMIN",
            organizationId: "org_1",
            createdAt: "2026-01-01",
          },
          organization: { id: "org_1", name: "Groviews", slug: "groviews" },
        },
      } as any);
      vi.spyOn(apiClient, "getPlatformCapabilities").mockResolvedValue({
        success: true,
        data: {
          isPlatformAdmin: true,
          platformRole: "PLATFORM_MASTER_ADMIN",
          canManagePlatformWhatsApp: true,
          canManageAllOrganizations: true,
          canAssignBusinesses: true,
        },
      } as any);

      await act(async () => {
        await result.current.login({ email: "balaji@gmail.com", password: "pwd" });
      });

      expect(result.current.user?.email).toBe("balaji@gmail.com");
      expect(result.current.platformCapabilities?.isPlatformAdmin).toBe(true);
      expect(result.current.platformCapabilities?.platformRole).toBe("PLATFORM_MASTER_ADMIN");
      expect(result.current.platformCapabilities?.canManageAllOrganizations).toBe(true);
    });

    it("denies global platform access to DELEGATED_ADMIN in Phase 9B", () => {
      vi.spyOn(AuthModule, "useAuth").mockReturnValue({
        user: {
          id: "usr_delegated",
          email: "delegated@agency.com",
          firstName: "Delegated",
          lastName: null,
          role: "OWNER",
          organizationId: "org_del",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        organization: { id: "org_del", name: "Agency", slug: "agency" },
        platformCapabilities: {
          isPlatformAdmin: false,
          platformRole: "DELEGATED_ADMIN",
          canManagePlatformWhatsApp: false,
          canManageAllOrganizations: false,
          canAssignBusinesses: false,
          assignedOrganizationIds: ["org_del"],
        },
        isAuthenticated: true,
        isLoading: false,
        login: vi.fn(),
        signup: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn(),
      });

      render(<MasterAdminPage />);
      expect(
        screen.getByText("Platform Master Administrator Authorization Required")
      ).toBeDefined();
    });
  });
});
