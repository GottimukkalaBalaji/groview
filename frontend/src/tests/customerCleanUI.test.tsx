import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Sidebar } from "../components/Sidebar.js";
import { Header } from "../components/Header.js";
import { WhatsAppStatusCard } from "../components/WhatsAppStatusCard.js";
import { ComingSoonPage } from "../pages/ComingSoonPage.js";
import { AuthPage } from "../pages/AuthPage.js";
import { getFriendlyTemplateName } from "../constants/templateAllowlist.js";
import { getCustomerFriendlyStatus } from "../components/CampaignDetailsModal.js";
import * as AuthModule from "../context/AuthContext.js";
import { SafeConnectionStatus } from "../types/whatsappIntegration.js";

describe("Customer-Only UI Cleanup & Real SaaS Presentation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AuthModule, "useAuth").mockReturnValue({
      user: {
        id: "usr_cust123",
        email: "owner@acmecorp.com",
        firstName: "Alice",
        lastName: "Smith",
        role: "OWNER",
        organizationId: "org_acme123",
        createdAt: "2026-10-10T00:00:00.000Z",
      },
      organization: {
        id: "org_acme123",
        name: "Acme Corp",
        slug: "acme-corp",
      },
      platformCapabilities: {
        isPlatformAdmin: false,
        canManageAllOrganizations: false,
        platformRole: "NONE",
        canManagePlatformWhatsApp: false,
        canAssignBusinesses: false,
      },
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

  describe("1. Template Friendly Names & Catalog", () => {
    it("maps all 3 supported campaign templates to human-friendly display names", () => {
      expect(getFriendlyTemplateName("hello_world")).toBe("Hello World Greeting");
      expect(getFriendlyTemplateName("jaspers_market_plain_text_v1")).toBe(
        "Jasper's Market (Promotional)"
      );
      expect(getFriendlyTemplateName("jaspers_market_order_confirmation_v1")).toBe(
        "Jasper's Market (Order Confirmation)"
      );
    });

    it("falls back gracefully for unknown template names", () => {
      expect(getFriendlyTemplateName("unknown_custom_promo")).toBe("unknown_custom_promo");
    });
  });

  describe("2. Customer Delivery Status Translation", () => {
    it("translates technical and infrastructure statuses into customer-friendly labels", () => {
      expect(getCustomerFriendlyStatus("ACCEPTED")).toBe("Accepted by WhatsApp");
      expect(getCustomerFriendlyStatus("SENT")).toBe("Sent");
      expect(getCustomerFriendlyStatus("DELIVERED")).toBe("Delivered");
      expect(getCustomerFriendlyStatus("READ")).toBe("Read");
      expect(getCustomerFriendlyStatus("FAILED")).toBe("Failed");
      expect(getCustomerFriendlyStatus("SUBMITTED_UNCONFIRMED")).toBe("Delivery confirmation pending");
      expect(getCustomerFriendlyStatus("QUEUED")).toBe("Queued");
      expect(getCustomerFriendlyStatus("UNKNOWN")).toBe("UNKNOWN");
    });
  });

  describe("3. Sidebar Navigation Cleanup", () => {
    it("renders customer platform branding and no developer sprint milestones", () => {
      render(
        <Sidebar
          currentView="dashboard"
          onNavigate={vi.fn()}
          isOpenMobile={false}
          canAccessMasterAdmin={false}
        />
      );

      // Customer platform branding in footer
      expect(screen.getByText("Grovastra Platform")).toBeDefined();

      // No developer/testing jargon
      expect(screen.queryByText("Local Development")).toBeNull();
      expect(screen.queryByText("Template Editor Active")).toBeNull();
      expect(screen.queryByText("Phase 4")).toBeNull();
      expect(screen.queryByText("Phase 5")).toBeNull();
    });
  });

  describe("4. Header Diagnostics Cleanup", () => {
    it("does not render backend probe or connectivity radio pills in customer header", () => {
      render(
        <Header
          title="Campaigns"
          onToggleMobileMenu={vi.fn()}
        />
      );

      // Customer title & user branding
      expect(screen.getByText("Campaigns")).toBeDefined();
      expect(screen.getByText("Alice Smith")).toBeDefined();
      expect(screen.getByText("Acme Corp")).toBeDefined();

      // No developer diagnostic elements
      expect(screen.queryByText("Backend Active")).toBeNull();
      expect(screen.queryByText("Backend Offline")).toBeNull();
      expect(screen.queryByRole("button", { name: /Probe Health/i })).toBeNull();
    });
  });

  describe("5. WhatsAppStatusCard Customer Presentation", () => {
    it("renders verified business status without leaking raw WABA ID or tenant isolation internals", () => {
      const mockSafeStatus: SafeConnectionStatus = {
        connected: true,
        status: "CONNECTED",
        mode: "SHARED_PLATFORM",
        displayPhoneNumber: "+1 555-0199",
        phoneNumberId: "109823485729182",
        wabaId: "1075305975271164",
        source: "PLATFORM_SHARED",
        verifiedName: "Grovastra Platform Sender",
        tokenExpiresAt: null,
        verifiedAt: null,
        lastSyncedAt: null,
        lastError: null,
      };

      render(
        <WhatsAppStatusCard
          status={mockSafeStatus}
        />
      );

      // Customer-facing status items
      expect(screen.getByText("Sender Status")).toBeDefined();
      expect(screen.getByText("Verified Business Sender")).toBeDefined();
      expect(screen.getByText("Grovastra Platform Sender")).toBeDefined();

      // No internal technical rows
      expect(screen.queryByText(/Meta WABA Account:/i)).toBeNull();
      expect(screen.queryByText(/Tenant Isolation:/i)).toBeNull();
      expect(screen.queryByText(/1075305975271164/i)).toBeNull();
    });
  });

  describe("6. ComingSoonPage & Analytics Telemetry Presentation", () => {
    it("renders clean customer-facing metrics cards for analytics without sprint milestone badges", () => {
      render(
        <ComingSoonPage
          view="analytics"
          onNavigate={vi.fn()}
        />
      );

      expect(screen.getByText("Total Dispatches")).toBeDefined();
      expect(screen.getByText("Delivered Confirmation")).toBeDefined();
      expect(screen.getByText("Read Rate")).toBeDefined();
      expect(screen.getByText("Delivery & Engagement Analytics")).toBeDefined();
      expect(screen.getByText("Upcoming Capabilities")).toBeDefined();

      // No sprint milestone badges or technical internals
      expect(screen.queryByText(/Phase 5 Milestone/i)).toBeNull();
      expect(screen.queryByText(/BullMQ queue processing/i)).toBeNull();
      expect(screen.queryByText(/Upstash Redis/i)).toBeNull();
      expect(screen.queryByText(/Planned Implementation Scope/i)).toBeNull();
      expect(screen.queryByText(/Try Template Editor Now/i)).toBeNull();
    });
  });

  describe("7. AuthPage Trust Strip", () => {
    it("displays customer-oriented security labels instead of internal technical jargon", () => {
      render(
        <AuthPage initialMode="login" />
      );

      // Customer trust badges
      expect(screen.getByText("Enterprise Security")).toBeDefined();
      expect(screen.getByText("Encrypted Data")).toBeDefined();
      expect(screen.getByText("Dedicated Workspace")).toBeDefined();

      // Developer/internal architecture terms removed
      expect(screen.queryByText("Tenant Isolated")).toBeNull();
      expect(screen.queryByText("HttpOnly Session")).toBeNull();
    });
  });
});
