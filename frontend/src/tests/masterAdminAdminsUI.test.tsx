import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MasterAdminPage } from "../pages/MasterAdminPage.js";
import { apiClient } from "../services/api.js";
import type { DelegatedAdminItem } from "../types/platform.js";

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

const mockDelegatedAdmins: DelegatedAdminItem[] = [
  {
    id: "usr_del_1",
    email: "dan@agency.com",
    firstName: "Dan",
    lastName: "Agency",
    platformRole: "DELEGATED_ADMIN",
    organizationId: "org_agency_dan",
    organizationName: "Dan's Agency",
    activeAssignmentsCount: 2,
    createdAt: "2026-10-20T10:00:00.000Z",
  },
  {
    id: "usr_del_2",
    email: "sara@partner.com",
    firstName: "Sara",
    lastName: "Partner",
    platformRole: "DELEGATED_ADMIN",
    organizationId: "org_agency_sara",
    organizationName: "Sara's Agency",
    activeAssignmentsCount: 0,
    createdAt: "2026-10-22T14:30:00.000Z",
  },
];

describe("Phase A1 — Master Admin Admins Tab UI & Creation Flow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(apiClient, "getPlatformOverview").mockResolvedValue({
      success: true,
      timestamp: "2026-10-27T10:00:00.000Z",
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
      timestamp: "2026-10-27T10:00:00.000Z",
      data: {
        organizations: [],
        pagination: { total: 0, page: 1, limit: 10, totalPages: 0 },
      },
    });

    vi.spyOn(apiClient, "getPlatformAssignments").mockResolvedValue({
      success: true,
      timestamp: "2026-10-27T10:00:00.000Z",
      data: {
        assignments: [],
        pagination: { total: 0, page: 1, limit: 10, totalPages: 0 },
        tableDeployed: true,
      },
    });

    vi.spyOn(apiClient, "getEligibleDelegatedAdmins").mockResolvedValue({
      success: true,
      timestamp: "2026-10-27T10:00:00.000Z",
      data: [],
    });

    vi.spyOn(apiClient, "getDelegatedAdmins").mockResolvedValue({
      success: true,
      timestamp: "2026-10-27T10:00:00.000Z",
      data: mockDelegatedAdmins,
    });

    vi.spyOn(apiClient, "createDelegatedAdmin").mockResolvedValue({
      success: true,
      timestamp: "2026-10-27T10:00:00.000Z",
      data: {
        id: "usr_del_new",
        email: "newadmin@agency.com",
        firstName: "Alice",
        lastName: "Admin",
        platformRole: "DELEGATED_ADMIN",
        organizationId: "org_agency_new",
        createdAt: "2026-10-27T10:00:00.000Z",
        organization: {
          id: "org_agency_new",
          name: "Alice Admin's Agency",
          slug: "agency-alice-admin",
        },
      },
    });
  });

  it("renders 5 navigation tabs including the new Admins tab", async () => {
    render(<MasterAdminPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /overview/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /organizations/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /business assignments/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /shared whatsapp platform/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /admins/i })).toBeInTheDocument();
    });
  });

  it("switches to the Admins tab and displays delegated administrators list", async () => {
    render(<MasterAdminPage />);

    const adminsTab = await screen.findByRole("button", { name: /admins/i });
    fireEvent.click(adminsTab);

    // Header and description
    expect(await screen.findByRole("heading", { name: /Delegated Platform Administrators/i })).toBeInTheDocument();
    expect(
      screen.getByText(/Create and manage agency delegated administrators with scoped tenant access/i)
    ).toBeInTheDocument();

    // Table rows
    expect(await screen.findByText("Dan Agency")).toBeInTheDocument();
    expect(screen.getByText("dan@agency.com")).toBeInTheDocument();
    expect(screen.getByText("Dan's Agency")).toBeInTheDocument();
    expect(screen.getByText(/2 assigned orgs/i)).toBeInTheDocument();

    expect(screen.getByText("Sara Partner")).toBeInTheDocument();
    expect(screen.getByText("sara@partner.com")).toBeInTheDocument();
    expect(screen.getByText("Sara's Agency")).toBeInTheDocument();
    expect(screen.getByText(/0 \(Unassigned\)/i)).toBeInTheDocument();

    // Total count badge
    expect(screen.getByText(/Total:/i)).toBeInTheDocument();
    expect(screen.getByText(/delegated admins/i)).toBeInTheDocument();
  });

  it("filters the admins list with the search input", async () => {
    render(<MasterAdminPage />);

    const adminsTab = await screen.findByRole("button", { name: /admins/i });
    fireEvent.click(adminsTab);

    await screen.findByText("Dan Agency");
    const searchInput = screen.getByPlaceholderText(/Search by name, email, or agency/i);
    fireEvent.change(searchInput, { target: { value: "dan" } });

    expect(screen.getByText("Dan Agency")).toBeInTheDocument();
    expect(screen.queryByText("Sara Partner")).not.toBeInTheDocument();
  });

  it("displays empty state when no delegated admins exist", async () => {
    vi.spyOn(apiClient, "getDelegatedAdmins").mockResolvedValueOnce({
      success: true,
      timestamp: "2026-10-27T10:00:00.000Z",
      data: [],
    });

    render(<MasterAdminPage />);

    const adminsTab = await screen.findByRole("button", { name: /admins/i });
    fireEvent.click(adminsTab);

    expect(await screen.findByText(/No delegated administrators configured/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create First Admin/i })).toBeInTheDocument();
  });

  it("opens the Create Admin modal with direct password choice fields", async () => {
    render(<MasterAdminPage />);

    const adminsTab = await screen.findByRole("button", { name: /admins/i });
    fireEvent.click(adminsTab);

    const createBtn = await screen.findByRole("button", { name: /Create Delegated Admin/i });
    fireEvent.click(createBtn);

    const modal = screen.getByRole("dialog");
    expect(within(modal).getByRole("heading", { name: /Create Delegated Administrator/i })).toBeInTheDocument();
    expect(within(modal).getByLabelText(/First Name/i)).toBeInTheDocument();
    expect(within(modal).getByLabelText(/Last Name/i)).toBeInTheDocument();
    expect(within(modal).getByLabelText(/Email Address/i)).toBeInTheDocument();
    expect(within(modal).getByLabelText(/^Account Password/i)).toBeInTheDocument();
    expect(within(modal).getByLabelText(/^Confirm Password/i)).toBeInTheDocument();
  });

  it("validates client-side password matching and complexity rules", async () => {
    render(<MasterAdminPage />);

    const adminsTab = await screen.findByRole("button", { name: /admins/i });
    fireEvent.click(adminsTab);

    const createBtn = await screen.findByRole("button", { name: /Create Delegated Admin/i });
    fireEvent.click(createBtn);

    const modal = screen.getByRole("dialog");
    const firstNameInput = within(modal).getByLabelText(/First Name/i);
    const emailInput = within(modal).getByLabelText(/Email Address/i);
    const passwordInput = within(modal).getByLabelText(/^Account Password/i);
    const confirmPasswordInput = within(modal).getByLabelText(/^Confirm Password/i);
    const submitBtn = within(modal).getByRole("button", { name: /Create Delegated Admin/i });

    // 1. Weak password (no uppercase)
    fireEvent.change(firstNameInput, { target: { value: "Test" } });
    fireEvent.change(emailInput, { target: { value: "test@agency.com" } });
    fireEvent.change(passwordInput, { target: { value: "weakpass123" } });
    fireEvent.change(confirmPasswordInput, { target: { value: "weakpass123" } });
    fireEvent.click(submitBtn);

    expect(
      await within(modal).findByText(/Password must contain at least one uppercase letter/i)
    ).toBeInTheDocument();
    expect(apiClient.createDelegatedAdmin).not.toHaveBeenCalled();

    // 2. Mismatched passwords
    fireEvent.change(passwordInput, { target: { value: "StrongPass123" } });
    fireEvent.change(confirmPasswordInput, { target: { value: "DifferentPass456" } });
    fireEvent.click(submitBtn);

    expect(await within(modal).findByText(/Passwords do not match/i)).toBeInTheDocument();
    expect(apiClient.createDelegatedAdmin).not.toHaveBeenCalled();
  });

  it("toggles password visibility between password and text types", async () => {
    render(<MasterAdminPage />);

    const adminsTab = await screen.findByRole("button", { name: /admins/i });
    fireEvent.click(adminsTab);

    const createBtn = await screen.findByRole("button", { name: /Create Delegated Admin/i });
    fireEvent.click(createBtn);

    const modal = screen.getByRole("dialog");
    const passwordInput = within(modal).getByLabelText(/^Account Password/i) as HTMLInputElement;
    expect(passwordInput.type).toBe("password");

    const toggleBtn = within(modal).getByRole("button", { name: /Show password/i });
    fireEvent.click(toggleBtn);
    expect(passwordInput.type).toBe("text");

    const hideBtn = within(modal).getByRole("button", { name: /Hide password/i });
    fireEvent.click(hideBtn);
    expect(passwordInput.type).toBe("password");
  });

  it("successfully creates a delegated admin, refreshes the list, and closes modal", async () => {
    render(<MasterAdminPage />);

    const adminsTab = await screen.findByRole("button", { name: /admins/i });
    fireEvent.click(adminsTab);

    const createBtn = await screen.findByRole("button", { name: /Create Delegated Admin/i });
    fireEvent.click(createBtn);

    const modal = screen.getByRole("dialog");
    fireEvent.change(within(modal).getByLabelText(/First Name/i), { target: { value: "Alice" } });
    fireEvent.change(within(modal).getByLabelText(/Last Name/i), { target: { value: "Admin" } });
    fireEvent.change(within(modal).getByLabelText(/Email Address/i), { target: { value: "alice@agency.com" } });
    fireEvent.change(within(modal).getByLabelText(/^Account Password/i), { target: { value: "Secur3P@ssw0rd!" } });
    fireEvent.change(within(modal).getByLabelText(/^Confirm Password/i), { target: { value: "Secur3P@ssw0rd!" } });

    const submitBtn = within(modal).getByRole("button", { name: /Create Delegated Admin/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiClient.createDelegatedAdmin).toHaveBeenCalledWith({
        firstName: "Alice",
        lastName: "Admin",
        email: "alice@agency.com",
        password: "Secur3P@ssw0rd!",
      });
    });

    // Feedback message is shown
    expect(
      await screen.findByText(/Delegated administrator account created successfully for alice@agency.com/i)
    ).toBeInTheDocument();

    // Modal is closed
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("dismisses modal with escape key or cancel button", async () => {
    render(<MasterAdminPage />);

    const adminsTab = await screen.findByRole("button", { name: /admins/i });
    fireEvent.click(adminsTab);

    const createBtn = await screen.findByRole("button", { name: /Create Delegated Admin/i });
    fireEvent.click(createBtn);

    const modal = screen.getByRole("dialog");
    expect(within(modal).getByRole("heading", { name: /Create Delegated Administrator/i })).toBeInTheDocument();

    // Dismiss with Cancel button
    const cancelBtn = within(modal).getByRole("button", { name: /Cancel/i });
    fireEvent.click(cancelBtn);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Reopen and dismiss with Escape key
    fireEvent.click(screen.getByRole("button", { name: /Create Delegated Admin/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("preserves navigation and functionality across existing tabs", async () => {
    render(<MasterAdminPage />);

    // 1. Overview
    const overviewTab = await screen.findByRole("button", { name: /overview/i });
    fireEvent.click(overviewTab);
    expect(await screen.findByRole("heading", { name: /Platform Telemetry & Key Metrics/i })).toBeInTheDocument();

    // 2. Organizations
    const orgsTab = await screen.findByRole("button", { name: /organizations/i });
    fireEvent.click(orgsTab);
    expect(await screen.findByPlaceholderText(/Search by name, slug, or ID/i)).toBeInTheDocument();

    // 3. Business Assignments
    const assignmentsTab = await screen.findByRole("button", { name: /business assignments/i });
    fireEvent.click(assignmentsTab);
    expect(await screen.findByRole("heading", { name: /Delegated Agency Business Assignments/i })).toBeInTheDocument();

    // 4. Shared WhatsApp Platform
    const waTab = await screen.findByRole("button", { name: /shared whatsapp platform/i });
    fireEvent.click(waTab);
    expect(await screen.findByRole("heading", { name: /Shared WhatsApp Meta Infrastructure/i })).toBeInTheDocument();

    // 5. Back to Admins
    const adminsTab = await screen.findByRole("button", { name: /admins/i });
    fireEvent.click(adminsTab);
    expect(await screen.findByRole("heading", { name: /Delegated Platform Administrators/i })).toBeInTheDocument();
  });
});
