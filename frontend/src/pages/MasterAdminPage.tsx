import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext.js";
import { apiClient, ApiClientError, sanitizeErrorMessage } from "../services/api.js";
import {
  PlatformOverview,
  PlatformOrganizationSummary,
  PlatformOrganizationDetail,
  PlatformWhatsAppStatus,
  PlatformTemplateItem,
  PlatformTemplateResponse,
  BusinessAssignmentSummary,
  EligibleDelegatedAdmin,
  DelegatedAdminItem,
} from "../types/platform.js";
import {
  ShieldCheck,
  Building2,
  Users,
  Settings,
  AlertTriangle,
  Lock,
  Layers,
  Search,
  RefreshCw,
  Eye,
  Archive,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  X,
  Copy,
  Check,
  Key,
  EyeOff,
  AlertCircle,
  Info,
  Unlink,
  UserX,
  PlusCircle,
} from "lucide-react";

type MasterAdminTab = "overview" | "organizations" | "assignments" | "whatsapp" | "admins";

export const MasterAdminPage: React.FC = () => {
  const { user, organization, platformCapabilities } = useAuth();
  const isPlatformAuthorized = Boolean(platformCapabilities?.isPlatformAdmin);

  // Active Tab
  const [activeTab, setActiveTab] = useState<MasterAdminTab>("overview");

  // Overview State
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  // Organizations State
  const [organizations, setOrganizations] = useState<PlatformOrganizationSummary[]>([]);
  const [orgTotal, setOrgTotal] = useState(0);
  const [orgPage, setOrgPage] = useState(1);
  const [orgTotalPages, setOrgTotalPages] = useState(1);
  const [orgSearch, setOrgSearch] = useState("");
  const [orgStatusFilter, setOrgStatusFilter] = useState<string>("all");
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);

  // Selected Organization Details Modal
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [selectedOrgDetail, setSelectedOrgDetail] = useState<PlatformOrganizationDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Organization Lifecycle Action (Archive / Reactivate)
  const [confirmActionOrg, setConfirmActionOrg] = useState<{
    org: PlatformOrganizationSummary;
    action: "archive" | "reactivate";
  } | null>(null);
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Shared WhatsApp Platform State
  const [whatsappStatus, setWhatsappStatus] = useState<PlatformWhatsAppStatus | null>(null);
  const [loadingWhatsApp, setLoadingWhatsApp] = useState(false);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);

  // Step 3: Shared WhatsApp Platform Credential Management State
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [connectWabaId, setConnectWabaId] = useState("");
  const [connectPhoneNumberId, setConnectPhoneNumberId] = useState("");
  const [connectAccessToken, setConnectAccessToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [isSubmittingConnect, setIsSubmittingConnect] = useState(false);
  const [connectModalError, setConnectModalError] = useState<string | null>(null);

  const [isReverifying, setIsReverifying] = useState(false);

  const [isDisconnectModalOpen, setIsDisconnectModalOpen] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);

  const [whatsappFeedback, setWhatsappFeedback] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  // Templates State
  const [templatesData, setTemplatesData] = useState<PlatformTemplateResponse | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [syncingTemplates, setSyncingTemplates] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  // Step 4: Delegated Business Assignment State
  const [assignments, setAssignments] = useState<BusinessAssignmentSummary[]>([]);
  const [assignmentsTotal, setAssignmentsTotal] = useState(0);
  const [assignmentsPage, setAssignmentsPage] = useState(1);
  const [assignmentsTotalPages, setAssignmentsTotalPages] = useState(1);
  const [assignmentsSearch, setAssignmentsSearch] = useState("");
  const [assignmentsStatusFilter, setAssignmentsStatusFilter] = useState<string>("ALL");
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  const [tableDeployed, setTableDeployed] = useState(true);
  const [tablePendingMessage, setTablePendingMessage] = useState<string | null>(null);

  // Eligible Delegated Admins for Assignment
  const [delegatedAdmins, setDelegatedAdmins] = useState<EligibleDelegatedAdmin[]>([]);
  const [loadingDelegatedAdmins, setLoadingDelegatedAdmins] = useState(false);

  // Assignment Modal State
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignOrgId, setAssignOrgId] = useState("");
  const [assignUserId, setAssignUserId] = useState("");
  const [assignReason, setAssignReason] = useState("");
  const [isSubmittingAssign, setIsSubmittingAssign] = useState(false);
  const [assignModalError, setAssignModalError] = useState<string | null>(null);

  // Revoke Modal State
  const [confirmRevokeAssignment, setConfirmRevokeAssignment] = useState<BusinessAssignmentSummary | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [isSubmittingRevoke, setIsSubmittingRevoke] = useState(false);
  const [revokeModalError, setRevokeModalError] = useState<string | null>(null);

  // General Assignment Feedback
  const [assignmentFeedback, setAssignmentFeedback] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  // Step 5: Delegated Admins Management State
  const [admins, setAdmins] = useState<DelegatedAdminItem[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [adminsError, setAdminsError] = useState<string | null>(null);
  const [adminsSearch, setAdminsSearch] = useState("");
  const [adminFeedback, setAdminFeedback] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  // Create Admin Modal State
  const [isCreateAdminModalOpen, setIsCreateAdminModalOpen] = useState(false);
  const [createAdminFirstName, setCreateAdminFirstName] = useState("");
  const [createAdminLastName, setCreateAdminLastName] = useState("");
  const [createAdminEmail, setCreateAdminEmail] = useState("");
  const [createAdminPassword, setCreateAdminPassword] = useState("");
  const [createAdminConfirmPassword, setCreateAdminConfirmPassword] = useState("");
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [showAdminConfirmPassword, setShowAdminConfirmPassword] = useState(false);
  const [isSubmittingCreateAdmin, setIsSubmittingCreateAdmin] = useState(false);
  const [createAdminModalError, setCreateAdminModalError] = useState<string | null>(null);


  // Copy helper with safe fallback and explicit feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const handleCopy = async (text: string) => {
    try {
      if (!navigator?.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(text);
      setCopiedId(text);
      setActionFeedback({
        type: "success",
        message: `Organization ID "${text}" copied to clipboard.`,
      });
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setCopiedId(null);
      setActionFeedback({
        type: "error",
        message: "Failed to copy ID to clipboard. Please select and copy manually.",
      });
    }
  };

  // 1. Fetch Overview Data
  const loadOverview = useCallback(async () => {
    if (!isPlatformAuthorized) return;
    setLoadingOverview(true);
    setOverviewError(null);
    try {
      const res = await apiClient.getPlatformOverview();
      if (res?.success && res.data) {
        setOverview(res.data);
      } else {
        setOverviewError("Failed to load platform overview");
      }
    } catch (err: unknown) {
      setOverviewError(err instanceof ApiClientError ? err.message : (err as Error).message || "An unexpected error occurred loading overview");
    } finally {
      setLoadingOverview(false);
    }
  }, [isPlatformAuthorized]);

  // 2. Fetch Organizations Data (with stable callback & current ref values)
  const orgSearchRef = React.useRef(orgSearch);
  orgSearchRef.current = orgSearch;
  const orgStatusRef = React.useRef(orgStatusFilter);
  orgStatusRef.current = orgStatusFilter;

  const loadOrganizations = useCallback(
    async (page = 1, search?: string, status?: string) => {
      if (!isPlatformAuthorized) return;
      const activeSearch = search !== undefined ? search : orgSearchRef.current;
      const activeStatus = status !== undefined ? status : orgStatusRef.current;
      setLoadingOrgs(true);
      setOrgError(null);
      try {
        const res = await apiClient.getPlatformOrganizations({
          page,
          limit: 10,
          search: activeSearch.trim() || undefined,
          status: activeStatus !== "all" ? activeStatus : undefined,
        });
        if (res?.success && res.data) {
          setOrganizations(res.data.organizations);
          setOrgTotal(res.data.pagination.total);
          setOrgPage(res.data.pagination.page);
          setOrgTotalPages(res.data.pagination.totalPages);
        } else {
          setOrgError("Failed to load organizations");
        }
      } catch (err: unknown) {
        setOrgError(err instanceof ApiClientError ? err.message : (err as Error).message || "An unexpected error occurred loading organizations");
      } finally {
        setLoadingOrgs(false);
      }
    },
    [isPlatformAuthorized]
  );

  // 3. Fetch Organization Details
  const loadOrganizationDetail = async (id: string) => {
    setSelectedOrgId(id);
    setSelectedOrgDetail(null);
    setLoadingDetail(true);
    setDetailError(null);
    try {
      const res = await apiClient.getPlatformOrganization(id);
      if (res?.success && res.data) {
        setSelectedOrgDetail(res.data);
      } else {
        setDetailError("Failed to load organization details");
      }
    } catch (err: unknown) {
      setDetailError(err instanceof ApiClientError ? err.message : (err as Error).message || "Failed to load organization details");
    } finally {
      setLoadingDetail(false);
    }
  };

  // 4. Archive / Reactivate Handler
  const handleLifecycleAction = async () => {
    if (!confirmActionOrg) return;
    setActionSubmitting(true);
    setActionFeedback(null);
    try {
      const { org, action } = confirmActionOrg;
      const res =
        action === "archive"
          ? await apiClient.archivePlatformOrganization(org.id)
          : await apiClient.reactivatePlatformOrganization(org.id);

      if (res?.success && res.data) {
        setActionFeedback({
          type: "success",
          message: `Organization "${org.name}" ${action === "archive" ? "deactivated & archived" : "reactivated"} successfully.`,
        });
        setConfirmActionOrg(null);
        // Refresh organizations list and overview counts
        loadOrganizations(orgPage);
        loadOverview();
      } else {
        setActionFeedback({
          type: "error",
          message: `Failed to ${action} organization`,
        });
      }
    } catch (err: unknown) {
      setActionFeedback({
        type: "error",
        message: err instanceof ApiClientError ? err.message : (err as Error).message || "An unexpected error occurred during lifecycle update",
      });
    } finally {
      setActionSubmitting(false);
    }
  };

  // 5. Fetch Shared WhatsApp Platform Status
  const loadWhatsAppStatus = useCallback(async () => {
    if (!isPlatformAuthorized) return;
    setLoadingWhatsApp(true);
    setWhatsappError(null);
    try {
      const res = await apiClient.getPlatformWhatsAppStatus();
      if (res?.success && res.data) {
        setWhatsappStatus(res.data);
      } else {
        setWhatsappError("Failed to load platform WhatsApp status");
      }
    } catch (err: unknown) {
      setWhatsappError(err instanceof ApiClientError ? err.message : (err as Error).message || "Failed to load platform WhatsApp status");
    } finally {
      setLoadingWhatsApp(false);
    }
  }, [isPlatformAuthorized]);

  // 6. Fetch Platform Templates
  const loadTemplates = useCallback(
    async (force = false) => {
      if (!isPlatformAuthorized) return;
      if (force) {
        setSyncingTemplates(true);
      } else {
        setLoadingTemplates(true);
      }
      setTemplatesError(null);
      try {
        const res = await apiClient.getPlatformTemplates(force);
        if (res?.success && res.data) {
          setTemplatesData(res.data);
        } else {
          setTemplatesError("Failed to load platform templates");
        }
      } catch (err: unknown) {
        setTemplatesError(err instanceof ApiClientError ? err.message : (err as Error).message || "Failed to load platform templates");
      } finally {
        setLoadingTemplates(false);
        setSyncingTemplates(false);
      }
    },
    [isPlatformAuthorized]
  );

  // Step 3 Helpers: Credential Modals and Actions
  const openConnectModal = () => {
    setConnectWabaId(whatsappStatus?.wabaId || "");
    setConnectPhoneNumberId(whatsappStatus?.phoneNumberId || "");
    // CRITICAL: NEVER prefill access token! Always empty string.
    setConnectAccessToken("");
    setShowToken(false);
    setConfirmOverwrite(false);
    setConnectModalError(null);
    setIsConnectModalOpen(true);
  };

  const closeConnectModal = () => {
    if (isSubmittingConnect) return;
    // CRITICAL: Clear sensitive access token immediately on modal close
    setConnectAccessToken("");
    setConnectModalError(null);
    setConfirmOverwrite(false);
    setIsConnectModalOpen(false);
  };

  const openDisconnectModal = () => {
    setDisconnectError(null);
    setIsDisconnectModalOpen(true);
  };

  const closeDisconnectModal = () => {
    if (isDisconnecting) return;
    setDisconnectError(null);
    setIsDisconnectModalOpen(false);
  };

  const handleConnectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingConnect) return;

    const trimmedWaba = connectWabaId.trim();
    const trimmedPhoneId = connectPhoneNumberId.trim();
    const trimmedToken = connectAccessToken.trim();

    if (!trimmedWaba) {
      setConnectModalError("WhatsApp Business Account ID (WABA ID) is required.");
      return;
    }
    if (!trimmedPhoneId) {
      setConnectModalError("Phone Number ID is required.");
      return;
    }
    if (!trimmedToken) {
      setConnectModalError("Meta System User Access Token is required.");
      return;
    }
    if (trimmedToken.length < 10) {
      setConnectModalError("Access token must be at least 10 characters.");
      return;
    }

    // Require explicit confirmation before replacing an active connection
    if (whatsappStatus?.connected && !confirmOverwrite) {
      setConnectModalError("Please confirm that you understand this will replace the active platform credentials.");
      return;
    }

    setIsSubmittingConnect(true);
    setConnectModalError(null);

    try {
      const res = await apiClient.connectPlatformWhatsApp({
        wabaId: trimmedWaba,
        phoneNumberId: trimmedPhoneId,
        accessToken: trimmedToken,
      });

      if (res?.success && res.data) {
        setWhatsappStatus(res.data);
        closeConnectModal();
        setWhatsappFeedback({
          type: "success",
          message: res.message || "Platform WhatsApp Business Account connected and verified successfully.",
        });
        loadTemplates(false);
      } else {
        setConnectModalError("Meta rejected connection verification. Please check your credentials.");
      }
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        if (err.statusCode === 401) {
          setConnectModalError("The provided Meta access token is invalid, expired, or has been revoked.");
        } else if (err.statusCode === 403) {
          setConnectModalError(
            "Access forbidden. Verify that the System User has 'whatsapp_business_messaging' and 'whatsapp_business_management' permissions."
          );
        } else if (err.statusCode === 409) {
          setConnectModalError("This WhatsApp Business Account ID or Phone Number ID is already linked to another organization.");
        } else {
          setConnectModalError(sanitizeErrorMessage(err.message) || "Failed to connect platform WhatsApp account.");
        }
      } else {
        const msg = (err as Error)?.message || "An unexpected error occurred while verifying Meta credentials.";
        setConnectModalError(sanitizeErrorMessage(msg));
      }
    } finally {
      // Clear sensitive token state immediately after attempt
      setConnectAccessToken("");
      setIsSubmittingConnect(false);
    }
  };

  const handleReverify = async () => {
    if (isReverifying || isSubmittingConnect || isDisconnecting) return;
    setIsReverifying(true);
    setWhatsappFeedback(null);

    try {
      const res = await apiClient.refreshPlatformWhatsApp();
      if (res?.success && res.data) {
        setWhatsappStatus(res.data);
        if (res.data.status === "TOKEN_EXPIRED") {
          setWhatsappFeedback({
            type: "error",
            message: "Platform Meta access token has expired or was revoked. Please update credentials.",
          });
        } else {
          setWhatsappFeedback({
            type: "success",
            message: res.message || "Platform WhatsApp connection verified and refreshed successfully.",
          });
        }
      } else {
        setWhatsappFeedback({
          type: "error",
          message: "Failed to re-verify platform WhatsApp credentials.",
        });
      }
    } catch (err: unknown) {
      // PRESERVE the existing connection state on failure! Do not overwrite whatsappStatus.
      const msg = err instanceof ApiClientError
        ? err.message
        : (err as Error)?.message || "Failed to re-verify platform WhatsApp connection.";
      setWhatsappFeedback({
        type: "error",
        message: sanitizeErrorMessage(msg),
      });
    } finally {
      setIsReverifying(false);
    }
  };

  const handleDisconnectConfirm = async () => {
    if (isDisconnecting) return;
    setIsDisconnecting(true);
    setDisconnectError(null);

    try {
      const res = await apiClient.disconnectPlatformWhatsApp();
      if (res?.success) {
        closeDisconnectModal();
        setWhatsappFeedback({
          type: "info",
          message: res.data?.message || res.message || "Platform WhatsApp connection successfully disconnected.",
        });
        await loadWhatsAppStatus();
      } else {
        setDisconnectError("Server rejected disconnect request.");
      }
    } catch (err: unknown) {
      const msg = err instanceof ApiClientError
        ? err.message
        : (err as Error)?.message || "Failed to disconnect platform WhatsApp connection.";
      setDisconnectError(sanitizeErrorMessage(msg));
    } finally {
      setIsDisconnecting(false);
    }
  };

  const getConnectionBadge = (status: PlatformWhatsAppStatus | null) => {
    if (!status) return null;
    if (status.connected && status.status === "CONNECTED") {
      return (
        <span className="badge badge-approved" style={{ fontSize: "0.82rem", padding: "0.35rem 0.7rem", display: "inline-flex", alignItems: "center", gap: "4px" }}>
          <CheckCircle2 size={14} />
          Connected & Verified
        </span>
      );
    }
    if (status.status === "TOKEN_EXPIRED" || status.status === "REVOKED") {
      return (
        <span className="badge badge-paused" style={{ fontSize: "0.82rem", padding: "0.35rem 0.7rem", display: "inline-flex", alignItems: "center", gap: "4px", backgroundColor: "rgba(239, 68, 68, 0.2)", color: "#f87171" }}>
          <AlertTriangle size={14} />
          Token Expired / Revoked
        </span>
      );
    }
    if (status.status === "PENDING_VERIFICATION") {
      return (
        <span className="badge badge-draft" style={{ fontSize: "0.82rem", padding: "0.35rem 0.7rem", display: "inline-flex", alignItems: "center", gap: "4px" }}>
          <Clock size={14} />
          Pending Verification
        </span>
      );
    }
    if (status.status === "DISCONNECTED") {
      return (
        <span className="badge badge-paused" style={{ fontSize: "0.82rem", padding: "0.35rem 0.7rem", display: "inline-flex", alignItems: "center", gap: "4px" }}>
          <XCircle size={14} />
          Disconnected
        </span>
      );
    }
    return (
      <span className="badge badge-paused" style={{ fontSize: "0.82rem", padding: "0.35rem 0.7rem", display: "inline-flex", alignItems: "center", gap: "4px" }}>
        <XCircle size={14} />
        {status.status || "Not Connected"}
      </span>
    );
  };

  // Step 4: Business Assignment Handlers
  const assignmentSearchRef = React.useRef(assignmentsSearch);
  assignmentSearchRef.current = assignmentsSearch;
  const assignmentStatusRef = React.useRef(assignmentsStatusFilter);
  assignmentStatusRef.current = assignmentsStatusFilter;

  const loadAssignments = useCallback(
    async (page = 1, search?: string, status?: string) => {
      if (!isPlatformAuthorized) return;
      setLoadingAssignments(true);
      setAssignmentsError(null);
      try {
        const effectiveSearch = search !== undefined ? search : assignmentSearchRef.current;
        const effectiveStatus = status !== undefined ? status : assignmentStatusRef.current;

        const res = await apiClient.getPlatformAssignments({
          page,
          search: effectiveSearch.trim() || undefined,
          status: effectiveStatus !== "ALL" ? effectiveStatus : undefined,
          limit: 10,
        });

        if (res?.success && res.data) {
          setAssignments(res.data.assignments || []);
          setAssignmentsTotal(res.data.pagination?.total || 0);
          setAssignmentsPage(res.data.pagination?.page || 1);
          setAssignmentsTotalPages(res.data.pagination?.totalPages || 1);
          setTableDeployed(res.data.tableDeployed !== false);
          setTablePendingMessage(res.data.message || null);
        } else {
          setAssignmentsError("Failed to load business assignments");
        }
      } catch (err: unknown) {
        setAssignmentsError(
          err instanceof ApiClientError
            ? sanitizeErrorMessage(err.message)
            : (err as Error).message || "An unexpected error occurred loading assignments"
        );
      } finally {
        setLoadingAssignments(false);
      }
    },
    [isPlatformAuthorized]
  );

  const loadDelegatedAdmins = useCallback(async () => {
    if (!isPlatformAuthorized) return;
    setLoadingDelegatedAdmins(true);
    try {
      const res = await apiClient.getEligibleDelegatedAdmins();
      if (res?.success && res.data) {
        setDelegatedAdmins(res.data);
      }
    } catch (err) {
      console.warn("Failed to load eligible delegated admins:", err);
    } finally {
      setLoadingDelegatedAdmins(false);
    }
  }, [isPlatformAuthorized]);

  const openAssignModal = () => {
    setAssignOrgId("");
    setAssignUserId("");
    setAssignReason("");
    setAssignModalError(null);
    setIsAssignModalOpen(true);
    loadDelegatedAdmins();
    if (organizations.length === 0) {
      loadOrganizations(1, "", "active");
    }
  };

  const closeAssignModal = () => {
    if (isSubmittingAssign) return;
    setIsAssignModalOpen(false);
    setAssignModalError(null);
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignOrgId.trim()) {
      setAssignModalError("Please select a target organization.");
      return;
    }
    if (!assignUserId.trim()) {
      setAssignModalError("Please select a delegated administrator.");
      return;
    }

    setIsSubmittingAssign(true);
    setAssignModalError(null);

    try {
      const res = await apiClient.createPlatformAssignment({
        organizationId: assignOrgId.trim(),
        userId: assignUserId.trim(),
        assignmentReason: assignReason.trim() || undefined,
      });

      if (res?.success) {
        setIsAssignModalOpen(false);
        setAssignmentFeedback({
          type: "success",
          message: `Successfully assigned organization '${res.data?.organization?.name || "selected organization"}' to delegated administrator (${res.data?.user?.email || "selected admin"}).`,
        });
        loadAssignments(1);
      } else {
        setAssignModalError("Failed to create assignment");
      }
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        if (err.details && Array.isArray(err.details) && err.details.length > 0) {
          const detailMsgs = err.details
            .map((d: any) => d.message || d.field)
            .filter(Boolean)
            .join(". ");
          setAssignModalError(detailMsgs || err.message);
        } else {
          setAssignModalError(sanitizeErrorMessage(err.message));
        }
      } else {
        const msg = (err as Error)?.message || "Failed to create assignment";
        setAssignModalError(sanitizeErrorMessage(msg));
      }
    } finally {
      setIsSubmittingAssign(false);
    }
  };

  const openRevokeModal = (assignment: BusinessAssignmentSummary) => {
    setConfirmRevokeAssignment(assignment);
    setRevokeReason("");
    setRevokeModalError(null);
  };

  const closeRevokeModal = () => {
    if (isSubmittingRevoke) return;
    setConfirmRevokeAssignment(null);
    setRevokeModalError(null);
  };

  const handleRevokeConfirm = async () => {
    if (!confirmRevokeAssignment) return;
    setIsSubmittingRevoke(true);
    setRevokeModalError(null);

    try {
      const res = await apiClient.revokePlatformAssignment(confirmRevokeAssignment.id, {
        revocationReason: revokeReason.trim() || undefined,
      });

      if (res?.success) {
        setConfirmRevokeAssignment(null);
        setAssignmentFeedback({
          type: "success",
          message: `Successfully revoked assignment for organization '${confirmRevokeAssignment.organization?.name || "selected organization"}'.`,
        });
        loadAssignments(assignmentsPage);
      } else {
        setRevokeModalError("Failed to revoke assignment");
      }
    } catch (err: unknown) {
      const msg = err instanceof ApiClientError ? err.message : (err as Error).message;
      setRevokeModalError(sanitizeErrorMessage(msg));
    } finally {
      setIsSubmittingRevoke(false);
    }
  };

  // Step 5: Delegated Admins Loader & Modal Handlers
  const loadAdmins = useCallback(async () => {
    if (!isPlatformAuthorized) return;
    setLoadingAdmins(true);
    setAdminsError(null);
    try {
      const res = await apiClient.getDelegatedAdmins();
      if (res?.success && res.data) {
        setAdmins(res.data);
      } else {
        setAdmins([]);
      }
    } catch (err: unknown) {
      const msg = err instanceof ApiClientError
        ? err.message
        : (err as Error)?.message || "Failed to load delegated administrators.";
      setAdminsError(sanitizeErrorMessage(msg));
    } finally {
      setLoadingAdmins(false);
    }
  }, [isPlatformAuthorized]);

  const openCreateAdminModal = () => {
    setCreateAdminFirstName("");
    setCreateAdminLastName("");
    setCreateAdminEmail("");
    setCreateAdminPassword("");
    setCreateAdminConfirmPassword("");
    setShowAdminPassword(false);
    setShowAdminConfirmPassword(false);
    setCreateAdminModalError(null);
    setIsCreateAdminModalOpen(true);
  };

  const closeCreateAdminModal = () => {
    if (isSubmittingCreateAdmin) return;
    setIsCreateAdminModalOpen(false);
    setCreateAdminModalError(null);
  };

  const handleCreateAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateAdminModalError(null);

    const cleanFirst = createAdminFirstName.trim();
    const cleanLast = createAdminLastName.trim();
    const cleanEmail = createAdminEmail.trim().toLowerCase();

    if (!cleanFirst) {
      setCreateAdminModalError("First name is required.");
      return;
    }
    if (!cleanEmail) {
      setCreateAdminModalError("Email is required.");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setCreateAdminModalError("Please provide a valid email address.");
      return;
    }
    if (!createAdminPassword) {
      setCreateAdminModalError("Password is required.");
      return;
    }
    if (createAdminPassword.length < 8) {
      setCreateAdminModalError("Password must be at least 8 characters long.");
      return;
    }
    if (createAdminPassword.length > 128) {
      setCreateAdminModalError("Password cannot exceed 128 characters.");
      return;
    }
    if (!/[A-Z]/.test(createAdminPassword)) {
      setCreateAdminModalError("Password must contain at least one uppercase letter.");
      return;
    }
    if (!/[a-z]/.test(createAdminPassword)) {
      setCreateAdminModalError("Password must contain at least one lowercase letter.");
      return;
    }
    if (!/[0-9]/.test(createAdminPassword)) {
      setCreateAdminModalError("Password must contain at least one numeric digit.");
      return;
    }
    if (createAdminPassword !== createAdminConfirmPassword) {
      setCreateAdminModalError("Passwords do not match.");
      return;
    }

    setIsSubmittingCreateAdmin(true);
    try {
      const res = await apiClient.createDelegatedAdmin({
        firstName: cleanFirst,
        lastName: cleanLast || undefined,
        email: cleanEmail,
        password: createAdminPassword,
      });

      if (res?.success) {
        setAdminFeedback({
          type: "success",
          message: `Delegated administrator account created successfully for ${cleanEmail}.`,
        });
        setIsCreateAdminModalOpen(false);
        loadAdmins();
        loadDelegatedAdmins();
      }
    } catch (err: unknown) {
      const msg = err instanceof ApiClientError
        ? err.message
        : (err as Error)?.message || "Failed to create delegated administrator.";
      setCreateAdminModalError(sanitizeErrorMessage(msg));
    } finally {
      setIsSubmittingCreateAdmin(false);
    }
  };

  // Prefetch platform overview on mount so telemetry and badges are warm
  useEffect(() => {
    if (isPlatformAuthorized && !overview) {
      loadOverview();
    }
  }, [isPlatformAuthorized, overview, loadOverview]);

  const organizationsRef = React.useRef(organizations);
  organizationsRef.current = organizations;

  // Initial Load & Tab Change triggers
  useEffect(() => {
    if (!isPlatformAuthorized) return;
    if (activeTab === "overview") {
      loadOverview();
    } else if (activeTab === "organizations") {
      loadOrganizations(1, orgSearch, orgStatusFilter);
    } else if (activeTab === "assignments") {
      loadAssignments(1, assignmentsSearch, assignmentsStatusFilter);
      loadDelegatedAdmins();
      if (organizationsRef.current.length === 0) {
        loadOrganizations(1, "", "active");
      }
    } else if (activeTab === "whatsapp") {
      loadWhatsAppStatus();
      loadTemplates(false);
    } else if (activeTab === "admins") {
      loadAdmins();
    }
  }, [
    activeTab,
    isPlatformAuthorized,
    loadOverview,
    loadOrganizations,
    loadWhatsAppStatus,
    loadTemplates,
    loadAssignments,
    loadDelegatedAdmins,
    loadAdmins,
    orgSearch,
    orgStatusFilter,
    assignmentsSearch,
    assignmentsStatusFilter,
  ]);

  // Debounced search effect: auto-refresh organizations when search query or status filter changes
  useEffect(() => {
    if (!isPlatformAuthorized || activeTab !== "organizations") return;
    const timer = setTimeout(() => {
      loadOrganizations(1, orgSearch, orgStatusFilter);
    }, 350);
    return () => clearTimeout(timer);
  }, [orgSearch, orgStatusFilter, isPlatformAuthorized, activeTab, loadOrganizations]);

  // Debounced search effect: auto-refresh assignments when search query or status filter changes
  useEffect(() => {
    if (!isPlatformAuthorized || activeTab !== "assignments") return;
    const timer = setTimeout(() => {
      loadAssignments(1, assignmentsSearch, assignmentsStatusFilter);
    }, 350);
    return () => clearTimeout(timer);
  }, [assignmentsSearch, assignmentsStatusFilter, isPlatformAuthorized, activeTab, loadAssignments]);

  // Modal keyboard accessibility: Escape key handling with pending operation protection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isDisconnectModalOpen) {
          if (!isDisconnecting) {
            setDisconnectError(null);
            setIsDisconnectModalOpen(false);
          }
        } else if (isConnectModalOpen) {
          if (!isSubmittingConnect) {
            setConnectAccessToken("");
            setConnectModalError(null);
            setConfirmOverwrite(false);
            setIsConnectModalOpen(false);
          }
        } else if (isAssignModalOpen) {
          if (!isSubmittingAssign) {
            setIsAssignModalOpen(false);
            setAssignModalError(null);
          }
        } else if (isCreateAdminModalOpen) {
          if (!isSubmittingCreateAdmin) {
            setIsCreateAdminModalOpen(false);
            setCreateAdminModalError(null);
          }
        } else if (confirmRevokeAssignment) {
          if (!isSubmittingRevoke) {
            setConfirmRevokeAssignment(null);
            setRevokeModalError(null);
          }
        } else if (confirmActionOrg) {
          // Do not close confirmation modal accidentally while an operation is pending
          if (!actionSubmitting) {
            setConfirmActionOrg(null);
          }
        } else if (selectedOrgId) {
          setSelectedOrgId(null);
        }
      }
    };

    if (
      isDisconnectModalOpen ||
      isConnectModalOpen ||
      isAssignModalOpen ||
      isCreateAdminModalOpen ||
      confirmRevokeAssignment ||
      confirmActionOrg ||
      selectedOrgId
    ) {
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [
    isDisconnectModalOpen,
    isDisconnecting,
    isConnectModalOpen,
    isSubmittingConnect,
    isAssignModalOpen,
    isSubmittingAssign,
    isCreateAdminModalOpen,
    isSubmittingCreateAdmin,
    confirmRevokeAssignment,
    isSubmittingRevoke,
    confirmActionOrg,
    selectedOrgId,
    actionSubmitting,
  ]);


  // 1. Strict Server Authorization Gate: Deny access if not verified platform principal
  if (!isPlatformAuthorized) {
    return (
      <div className="dashboard-view">
        <div
          className="glass-panel"
          style={{
            maxWidth: "680px",
            margin: "3rem auto",
            padding: "2.5rem",
            textAlign: "center",
            border: "1px solid rgba(239, 68, 68, 0.3)",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              backgroundColor: "rgba(239, 68, 68, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.5rem auto",
              color: "#f87171",
            }}
          >
            <Lock size={28} />
          </div>

          <h2 style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.75rem" }}>
            Platform Master Administrator Authorization Required
          </h2>

          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: 1.6, marginBottom: "1.5rem" }}>
            This section is restricted to Grovastra platform operators. Your active authenticated role is{" "}
            <strong style={{ color: "var(--accent-emerald)" }}>{user?.role || "MEMBER"}</strong> within organization{" "}
            <strong style={{ color: "var(--text-primary)" }}>{organization?.name || "your tenant"}</strong>.
          </p>

          <div
            style={{
              padding: "1rem",
              borderRadius: "8px",
              backgroundColor: "rgba(15, 23, 42, 0.6)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              textAlign: "left",
              fontSize: "0.85rem",
              color: "var(--text-muted)",
              marginBottom: "1.5rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem", color: "#fbbf24" }}>
              <AlertTriangle size={16} />
              <strong>Tenant Isolation Guarantee</strong>
            </div>
            Customer organization roles (OWNER, ADMIN, MEMBER) are strictly tenant-isolated by server middleware and never grant platform-wide access, multi-tenant directory browsing, or platform WhatsApp credential controls.
          </div>

          <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
            Principal ID: {user?.id || "anonymous"} • Tenant Scope: {organization?.id || "unassigned"}
          </span>
        </div>
      </div>
    );
  }

  // 2. Verified Master Admin Dashboard
  return (
    <main className="dashboard-view">
      {/* Header */}
      <section className="dashboard-welcome-header" style={{ marginBottom: "1.5rem" }}>
        <div className="welcome-text-col">
          <div className="welcome-title-row">
            <h1 className="dashboard-heading">Master Admin Dashboard</h1>
            <span className="platform-tag" style={{ backgroundColor: "rgba(99, 102, 241, 0.2)", color: "#a5b4fc" }}>
              PLATFORM_MASTER_ADMIN
            </span>
          </div>
          <p className="welcome-subtitle">
            Global governance for customer organizations, platform WhatsApp infrastructure, and system telemetry.
          </p>
        </div>
      </section>

      {/* Global Feedback Banner */}
      {actionFeedback && (
        <div
          className="glass-panel"
          style={{
            padding: "1rem 1.25rem",
            marginBottom: "1.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            border: `1px solid ${actionFeedback.type === "success" ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
            backgroundColor: actionFeedback.type === "success" ? "rgba(16, 185, 129, 0.08)" : "rgba(239, 68, 68, 0.08)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            {actionFeedback.type === "success" ? (
              <CheckCircle2 size={18} style={{ color: "var(--accent-emerald)" }} />
            ) : (
              <XCircle size={18} style={{ color: "#f87171" }} />
            )}
            <span style={{ fontSize: "0.9rem", color: "var(--text-primary)" }}>{actionFeedback.message}</span>
          </div>
          <button
            onClick={() => setActionFeedback(null)}
            style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
            aria-label="Dismiss feedback"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Sub-Navigation Tabs */}
      <nav className="master-admin-tabs-nav" aria-label="Master Admin Navigation Tabs">
        <button
          className={`master-admin-tab-btn ${activeTab === "overview" ? "active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          <Layers size={16} />
          Overview
        </button>
        <button
          className={`master-admin-tab-btn ${activeTab === "organizations" ? "active" : ""}`}
          onClick={() => setActiveTab("organizations")}
        >
          <Building2 size={16} />
          Organizations
          {(overview?.organizations?.total !== undefined || orgTotal > 0) && (
            <span
              style={{
                marginLeft: "4px",
                padding: "2px 6px",
                borderRadius: "10px",
                fontSize: "0.72rem",
                backgroundColor: "rgba(255, 255, 255, 0.1)",
              }}
            >
              {overview?.organizations?.total ?? orgTotal}
            </span>
          )}
        </button>
        <button
          className={`master-admin-tab-btn ${activeTab === "assignments" ? "active" : ""}`}
          onClick={() => setActiveTab("assignments")}
        >
          <Users size={16} />
          Business Assignments
          {assignmentsTotal > 0 && (
            <span
              style={{
                marginLeft: "4px",
                padding: "2px 6px",
                borderRadius: "10px",
                fontSize: "0.72rem",
                backgroundColor: "rgba(255, 255, 255, 0.1)",
              }}
            >
              {assignmentsTotal}
            </span>
          )}
        </button>
        <button
          className={`master-admin-tab-btn ${activeTab === "whatsapp" ? "active" : ""}`}
          onClick={() => setActiveTab("whatsapp")}
        >
          <Settings size={16} />
          Shared WhatsApp Platform
        </button>
        <button
          className={`master-admin-tab-btn ${activeTab === "admins" ? "active" : ""}`}
          onClick={() => setActiveTab("admins")}
        >
          <ShieldCheck size={16} />
          Admins
          {admins.length > 0 && (
            <span
              style={{
                marginLeft: "4px",
                padding: "2px 6px",
                borderRadius: "10px",
                fontSize: "0.72rem",
                backgroundColor: "rgba(255, 255, 255, 0.1)",
              }}
            >
              {admins.length}
            </span>
          )}
        </button>
      </nav>

      {/* TAB 1: OVERVIEW */}
      {activeTab === "overview" && (
        <section aria-labelledby="overview-heading">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
            <h2 id="overview-heading" style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
              Platform Telemetry & Key Metrics
            </h2>
            <button
              onClick={loadOverview}
              disabled={loadingOverview}
              className="btn btn-secondary"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0.85rem", fontSize: "0.82rem" }}
            >
              <RefreshCw size={14} className={loadingOverview ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>

          {loadingOverview && !overview && (
            <div className="glass-panel" style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
              <RefreshCw size={28} className="animate-spin" style={{ margin: "0 auto 1rem auto" }} />
              <p>Fetching platform overview from backend...</p>
            </div>
          )}

          {overviewError && (
            <div
              className="glass-panel"
              style={{
                padding: "1.5rem",
                marginBottom: "1.5rem",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                backgroundColor: "rgba(239, 68, 68, 0.05)",
                color: "#f87171",
              }}
            >
              <AlertTriangle size={20} aria-hidden="true" focusable={false} style={{ marginBottom: "0.5rem" }} />
              <p style={{ margin: 0 }}>{overviewError}</p>
            </div>
          )}

          {overview && (
            <>
              {/* Telemetry Cards Grid */}
              <div className="metrics-grid" style={{ marginBottom: "2rem" }}>
                {/* Metric 1: Total Customer Organizations */}
                <div className="metric-card glass-panel">
                  <div className="metric-card-header">
                    <span className="metric-card-title">Customer Organizations</span>
                    <Building2 size={18} className="metric-icon" style={{ color: "var(--accent-emerald)" }} />
                  </div>
                  <div className="metric-card-value" style={{ fontSize: "2rem", fontWeight: 700, margin: "0.5rem 0" }}>
                    {overview.organizations.total}
                  </div>
                  <div className="metric-card-subtext" style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                    <span style={{ color: "var(--accent-emerald)", fontWeight: 600 }}>{overview.organizations.active} Active</span>
                    {" • "}
                    <span style={{ color: overview.organizations.archived > 0 ? "#fbbf24" : "var(--text-muted)" }}>
                      {overview.organizations.archived} Archived
                    </span>
                  </div>
                </div>

                {/* Metric 2: Total Registered Users */}
                <div className="metric-card glass-panel">
                  <div className="metric-card-header">
                    <span className="metric-card-title">Registered Users</span>
                    <Users size={18} className="metric-icon" style={{ color: "#818cf8" }} />
                  </div>
                  <div className="metric-card-value" style={{ fontSize: "2rem", fontWeight: 700, margin: "0.5rem 0" }}>
                    {overview.users.total}
                  </div>
                  <div className="metric-card-subtext" style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                    <span>{overview.users.masterAdmins} Master Admin</span>
                    {" • "}
                    <span>{overview.users.regularUsers} Customer Users</span>
                  </div>
                </div>

                {/* Metric 3: Connected WhatsApp Accounts */}
                <div className="metric-card glass-panel">
                  <div className="metric-card-header">
                    <span className="metric-card-title">Connected WhatsApp Orgs</span>
                    <MessageSquare size={18} className="metric-icon" style={{ color: "#38bdf8" }} />
                  </div>
                  <div className="metric-card-value" style={{ fontSize: "2rem", fontWeight: 700, margin: "0.5rem 0" }}>
                    {overview.whatsapp.organizationsWithConnectedAccount}
                  </div>
                  <div className="metric-card-subtext" style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                    Mode: <strong style={{ color: "var(--text-primary)" }}>{overview.mode}</strong>
                  </div>
                </div>

                {/* Metric 4: Platform WhatsApp Status */}
                <div className="metric-card glass-panel">
                  <div className="metric-card-header">
                    <span className="metric-card-title">Shared WhatsApp Sender</span>
                    <Settings size={18} className="metric-icon" style={{ color: "#a855f7" }} />
                  </div>
                  <div style={{ margin: "0.75rem 0" }}>
                    {overview.whatsapp.connected ? (
                      <span className="badge badge-approved" style={{ fontSize: "0.85rem", padding: "0.3rem 0.65rem" }}>
                        <CheckCircle2 size={14} style={{ marginRight: "4px" }} />
                        Connected
                      </span>
                    ) : (
                      <span className="badge badge-paused" style={{ fontSize: "0.85rem", padding: "0.3rem 0.65rem" }}>
                        <XCircle size={14} style={{ marginRight: "4px" }} />
                        {overview.whatsapp.status}
                      </span>
                    )}
                  </div>
                  <div className="metric-card-subtext" style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                    {overview.whatsapp.displayPhoneNumber || "Platform Phone Unconfigured"}
                  </div>
                </div>
              </div>

              {/* System Architecture Guarantees */}
              <div className="glass-panel" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
                  <ShieldCheck size={20} style={{ color: "var(--accent-emerald)" }} />
                  <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                    Master Admin Security & Platform Architecture
                  </h3>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
                  <div style={{ padding: "1rem", borderRadius: "8px", backgroundColor: "rgba(255, 255, 255, 0.03)" }}>
                    <div style={{ fontWeight: 600, color: "var(--accent-emerald)", marginBottom: "0.25rem", fontSize: "0.875rem" }}>
                      Strict Server-Side Authorization
                    </div>
                    <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
                      All platform routes reject customer OWNER, ADMIN, and MEMBER roles. Client role headers are strictly stripped.
                    </p>
                  </div>
                  <div style={{ padding: "1rem", borderRadius: "8px", backgroundColor: "rgba(255, 255, 255, 0.03)" }}>
                    <div style={{ fontWeight: 600, color: "#818cf8", marginBottom: "0.25rem", fontSize: "0.875rem" }}>
                      Non-Destructive Lifecycle
                    </div>
                    <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
                      Organizations are soft-archived and reactivated without permanent data deletion. Active sessions are revoked on deactivation.
                    </p>
                  </div>
                  <div style={{ padding: "1rem", borderRadius: "8px", backgroundColor: "rgba(255, 255, 255, 0.03)" }}>
                    <div style={{ fontWeight: 600, color: "#fbbf24", marginBottom: "0.25rem", fontSize: "0.875rem" }}>
                      Zero Secret Exposure
                    </div>
                    <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
                      Access tokens, encryption keys, and secrets are never returned to client browsers or platform endpoints.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {/* TAB 2: ORGANIZATIONS */}
      {activeTab === "organizations" && (
        <section aria-labelledby="orgs-heading">
          {/* Controls Bar: Search & Status Filter */}
          <div
            className="glass-panel"
            style={{
              padding: "1rem 1.25rem",
              marginBottom: "1.25rem",
              display: "flex",
              flexWrap: "wrap",
              gap: "1rem",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", flex: 1, minWidth: "260px" }}>
              {/* Search Bar */}
              <div style={{ position: "relative", flex: 1, minWidth: "200px", maxWidth: "400px" }}>
                <Search
                  size={16}
                  style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}
                />
                <input
                  type="text"
                  placeholder="Search by name, slug, or ID..."
                  value={orgSearch}
                  onChange={(e) => setOrgSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") loadOrganizations(1, orgSearch, orgStatusFilter);
                  }}
                  style={{
                    width: "100%",
                    padding: orgSearch.length > 0 ? "0.5rem 2.25rem 0.5rem 2.25rem" : "0.5rem 0.75rem 0.5rem 2.25rem",
                    borderRadius: "6px",
                    border: "1px solid var(--border-subtle)",
                    backgroundColor: "rgba(15, 23, 42, 0.6)",
                    color: "var(--text-primary)",
                    fontSize: "0.85rem",
                  }}
                />
                {orgSearch.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setOrgSearch("");
                      loadOrganizations(1, "", orgStatusFilter);
                    }}
                    style={{
                      position: "absolute",
                      right: "10px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      padding: "2px",
                      display: "flex",
                      alignItems: "center",
                    }}
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Status Filter */}
              <select
                value={orgStatusFilter}
                onChange={(e) => {
                  setOrgStatusFilter(e.target.value);
                  loadOrganizations(1, orgSearch, e.target.value);
                }}
                style={{
                  padding: "0.5rem 0.75rem",
                  borderRadius: "6px",
                  border: "1px solid var(--border-subtle)",
                  backgroundColor: "rgba(15, 23, 42, 0.6)",
                  color: "var(--text-primary)",
                  fontSize: "0.85rem",
                }}
              >
                <option value="all">All Statuses</option>
                <option value="active">Active Only</option>
                <option value="archived">Archived Only</option>
              </select>

              <button
                onClick={() => loadOrganizations(1, orgSearch, orgStatusFilter)}
                className="btn btn-secondary"
                style={{ padding: "0.4rem 0.85rem", fontSize: "0.85rem" }}
              >
                Search
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                Total: <strong>{orgTotal}</strong>
              </span>
              <button
                onClick={() => loadOrganizations(orgPage)}
                disabled={loadingOrgs}
                className="btn btn-secondary"
                style={{ padding: "0.4rem 0.75rem", fontSize: "0.82rem" }}
                title="Refresh Organizations"
              >
                <RefreshCw size={14} className={loadingOrgs ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          {/* Error Message */}
          {orgError && (
            <div
              className="glass-panel"
              style={{
                padding: "1rem",
                marginBottom: "1rem",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "#f87171",
                fontSize: "0.875rem",
              }}
            >
              {orgError}
            </div>
          )}

          {/* Responsive Organizations Table */}
          <div className="master-admin-table-container">
            <div className="master-admin-table-wrapper">
              <table className="master-admin-table" aria-label="Customer Organizations Table">
                <thead>
                  <tr>
                    <th>Organization</th>
                    <th>ID</th>
                    <th>Status</th>
                    <th>Users</th>
                    <th>WhatsApp</th>
                    <th>Created</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingOrgs && organizations.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: "2.5rem", color: "var(--text-muted)" }}>
                        <RefreshCw size={24} className="animate-spin" style={{ margin: "0 auto 0.5rem auto" }} />
                        Loading organizations...
                      </td>
                    </tr>
                  ) : organizations.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: "2.5rem", color: "var(--text-muted)" }}>
                        No organizations found matching search criteria.
                      </td>
                    </tr>
                  ) : (
                    organizations.map((org) => {
                      const isArchived = org.status === "ARCHIVED";
                      const isSelf = org.id === organization?.id;
                      return (
                        <tr key={org.id}>
                          <td>
                            <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{org.name}</div>
                            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{org.slug}</div>
                          </td>
                          <td>
                            <button
                              onClick={() => handleCopy(org.id)}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.25rem",
                                background: "none",
                                border: "none",
                                color: "var(--text-secondary)",
                                cursor: "pointer",
                                fontFamily: "monospace",
                                fontSize: "0.78rem",
                              }}
                              title="Click to copy ID"
                            >
                              {org.id.slice(0, 10)}...
                              {copiedId === org.id ? <Check size={12} color="var(--accent-emerald)" /> : <Copy size={12} />}
                            </button>
                          </td>
                          <td>
                            {isArchived ? (
                              <span className="badge badge-paused" style={{ fontSize: "0.75rem" }}>
                                Archived
                              </span>
                            ) : (
                              <span className="badge badge-approved" style={{ fontSize: "0.75rem" }}>
                                Active
                              </span>
                            )}
                          </td>
                          <td>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                              <Users size={14} style={{ color: "var(--text-muted)" }} />
                              {org.userCount}
                            </span>
                          </td>
                          <td>
                            {org.hasMetaAccount ? (
                              <span style={{ fontSize: "0.78rem", color: "var(--accent-emerald)", fontWeight: 500 }}>
                                Connected
                              </span>
                            ) : (
                              <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>None</span>
                            )}
                          </td>
                          <td style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                            {new Date(org.createdAt).toLocaleDateString()}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <div style={{ display: "inline-flex", gap: "0.5rem" }}>
                              <button
                                onClick={() => loadOrganizationDetail(org.id)}
                                className="btn btn-secondary"
                                style={{ padding: "0.3rem 0.6rem", fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                                title="View Organization Details"
                              >
                                <Eye size={13} />
                                Details
                              </button>
                              {isArchived ? (
                                <button
                                  onClick={() => setConfirmActionOrg({ org, action: "reactivate" })}
                                  className="btn btn-secondary"
                                  style={{
                                    padding: "0.3rem 0.6rem",
                                    fontSize: "0.78rem",
                                    color: "var(--accent-emerald)",
                                    borderColor: "rgba(16, 185, 129, 0.4)",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                  }}
                                  title="Reactivate Organization"
                                >
                                  <RotateCcw size={13} />
                                  Reactivate
                                </button>
                              ) : (
                                <button
                                  onClick={() => setConfirmActionOrg({ org, action: "archive" })}
                                  disabled={isSelf}
                                  className="btn btn-secondary"
                                  style={{
                                    padding: "0.3rem 0.6rem",
                                    fontSize: "0.78rem",
                                    color: isSelf ? "var(--text-muted)" : "#f87171",
                                    borderColor: isSelf ? "transparent" : "rgba(239, 68, 68, 0.3)",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                    cursor: isSelf ? "not-allowed" : "pointer",
                                  }}
                                  title={isSelf ? "Cannot archive your active operator organization" : "Archive / Deactivate"}
                                >
                                  <Archive size={13} />
                                  Archive
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination Controls */}
          {orgTotalPages > 1 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: "1rem",
                padding: "0.5rem 0",
              }}
            >
              <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                Page {orgPage} of {orgTotalPages} ({orgTotal} total organizations)
              </span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  disabled={orgPage <= 1 || loadingOrgs}
                  onClick={() => loadOrganizations(orgPage - 1)}
                  className="btn btn-secondary"
                  style={{ padding: "0.35rem 0.75rem", fontSize: "0.82rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                >
                  <ChevronLeft size={14} />
                  Previous
                </button>
                <button
                  disabled={orgPage >= orgTotalPages || loadingOrgs}
                  onClick={() => loadOrganizations(orgPage + 1)}
                  className="btn btn-secondary"
                  style={{ padding: "0.35rem 0.75rem", fontSize: "0.82rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                >
                  Next
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* TAB 3: BUSINESS ASSIGNMENTS */}
      {activeTab === "assignments" && (
        <section aria-labelledby="assignments-heading">
          {/* Header & Primary Actions */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
            <div>
              <h2 id="assignments-heading" style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                Delegated Agency Business Assignments
              </h2>
              <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                Manage tenant delegation and scoped business access for agency administrators (DELEGATED_ADMIN)
              </span>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                onClick={openAssignModal}
                className="btn btn-primary"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.4rem 0.85rem",
                  fontSize: "0.82rem",
                  backgroundColor: "var(--accent-emerald)",
                  color: "#ffffff",
                }}
              >
                <PlusCircle size={14} />
                Assign Business
              </button>
              <button
                type="button"
                onClick={() => loadAssignments(assignmentsPage, assignmentsSearch, assignmentsStatusFilter)}
                disabled={loadingAssignments}
                className="btn btn-secondary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0.85rem", fontSize: "0.82rem" }}
              >
                <RefreshCw size={14} className={loadingAssignments ? "animate-spin" : ""} />
                Refresh
              </button>
            </div>
          </div>

          {/* Feedback Banner (Success / Error / Info) */}
          {assignmentFeedback && (
            <div
              role="alert"
              className="glass-panel"
              style={{
                padding: "0.85rem 1.25rem",
                marginBottom: "1rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                border: assignmentFeedback.type === "success"
                  ? "1px solid rgba(16, 185, 129, 0.4)"
                  : assignmentFeedback.type === "error"
                  ? "1px solid rgba(239, 68, 68, 0.4)"
                  : "1px solid rgba(59, 130, 246, 0.4)",
                backgroundColor: assignmentFeedback.type === "success"
                  ? "rgba(16, 185, 129, 0.1)"
                  : assignmentFeedback.type === "error"
                  ? "rgba(239, 68, 68, 0.1)"
                  : "rgba(59, 130, 246, 0.1)",
                color: assignmentFeedback.type === "success"
                  ? "var(--accent-emerald)"
                  : assignmentFeedback.type === "error"
                  ? "#f87171"
                  : "#60a5fa",
                fontSize: "0.875rem",
                borderRadius: "8px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                {assignmentFeedback.type === "success" ? (
                  <CheckCircle2 size={16} />
                ) : assignmentFeedback.type === "error" ? (
                  <AlertCircle size={16} />
                ) : (
                  <Info size={16} />
                )}
                <span>{assignmentFeedback.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setAssignmentFeedback(null)}
                style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: "2px" }}
                aria-label="Dismiss feedback"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Migration Pending Notice */}
          {!tableDeployed && (
            <div
              className="glass-panel"
              style={{
                padding: "1rem 1.25rem",
                marginBottom: "1.25rem",
                borderRadius: "8px",
                border: "1px solid rgba(245, 158, 11, 0.4)",
                backgroundColor: "rgba(245, 158, 11, 0.08)",
                color: "#fbbf24",
                fontSize: "0.85rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
                <AlertTriangle size={18} aria-hidden="true" focusable={false} style={{ flexShrink: 0, marginTop: "2px" }} />
                <div>
                  <strong style={{ display: "block", color: "#fef3c7", marginBottom: "4px" }}>
                    Database Migration Pending
                  </strong>
                  <p style={{ margin: "0 0 6px 0", lineHeight: 1.5, color: "var(--text-secondary)" }}>
                    {tablePendingMessage ||
                      "The BusinessAssignment table has not yet been applied to the remote database. The backend fails closed safely, and no business assignments can be stored until pending database migrations are deployed."}
                  </p>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                    In accordance with Grovastra safeguards, migrations are not executed automatically. Existing data and tenant isolation remain completely intact.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Filter Bar: Search & Status Filter */}
          <div
            className="glass-panel"
            style={{
              padding: "1rem 1.25rem",
              marginBottom: "1.25rem",
              display: "flex",
              flexWrap: "wrap",
              gap: "1rem",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", flex: 1, minWidth: "260px" }}>
              {/* Search Bar */}
              <div style={{ position: "relative", flex: 1, minWidth: "220px", maxWidth: "420px" }}>
                <Search
                  size={16}
                  style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}
                />
                <input
                  type="text"
                  placeholder="Search by organization, admin email, or slug..."
                  value={assignmentsSearch}
                  onChange={(e) => setAssignmentsSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") loadAssignments(1, assignmentsSearch, assignmentsStatusFilter);
                  }}
                  style={{
                    width: "100%",
                    padding: assignmentsSearch.length > 0 ? "0.5rem 2.25rem 0.5rem 2.25rem" : "0.5rem 0.75rem 0.5rem 2.25rem",
                    borderRadius: "6px",
                    border: "1px solid var(--border-subtle)",
                    backgroundColor: "rgba(15, 23, 42, 0.6)",
                    color: "var(--text-primary)",
                    fontSize: "0.875rem",
                    boxSizing: "border-box",
                  }}
                />
                {assignmentsSearch && (
                  <button
                    onClick={() => {
                      setAssignmentsSearch("");
                      loadAssignments(1, "", assignmentsStatusFilter);
                    }}
                    style={{
                      position: "absolute",
                      right: "10px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      padding: "2px",
                    }}
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Status Filter */}
              <select
                value={assignmentsStatusFilter}
                onChange={(e) => {
                  setAssignmentsStatusFilter(e.target.value);
                  loadAssignments(1, assignmentsSearch, e.target.value);
                }}
                style={{
                  padding: "0.5rem 0.85rem",
                  borderRadius: "6px",
                  border: "1px solid var(--border-subtle)",
                  backgroundColor: "rgba(15, 23, 42, 0.6)",
                  color: "var(--text-primary)",
                  fontSize: "0.875rem",
                  cursor: "pointer",
                }}
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active Only</option>
                <option value="REVOKED">Revoked Only</option>
              </select>
            </div>

            <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
              Total: <strong style={{ color: "var(--text-primary)" }}>{assignmentsTotal}</strong> assignments
            </div>
          </div>

          {/* Error Message */}
          {assignmentsError && (
            <div
              role="alert"
              className="glass-panel"
              style={{
                padding: "1rem",
                marginBottom: "1rem",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "#f87171",
                fontSize: "0.875rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span>{assignmentsError}</span>
              <button
                type="button"
                onClick={() => loadAssignments(assignmentsPage, assignmentsSearch, assignmentsStatusFilter)}
                className="btn btn-secondary"
                style={{ fontSize: "0.78rem", padding: "0.25rem 0.6rem" }}
              >
                Retry
              </button>
            </div>
          )}

          {/* Assignments Table or Loading / Empty States */}
          {loadingAssignments ? (
            <div className="glass-panel" style={{ padding: "3rem 1rem", textAlign: "center", color: "var(--text-muted)" }}>
              <RefreshCw size={24} className="animate-spin" style={{ margin: "0 auto 0.75rem auto", display: "block" }} />
              <p style={{ margin: 0, fontSize: "0.875rem" }}>Loading business assignments...</p>
            </div>
          ) : assignments.length === 0 ? (
            <div className="glass-panel" style={{ padding: "3rem 1.5rem", textAlign: "center" }}>
              <Users size={36} style={{ color: "var(--text-muted)", margin: "0 auto 1rem auto", display: "block" }} />
              <h3 style={{ fontSize: "1.05rem", fontWeight: 600, color: "var(--text-primary)", margin: "0 0 0.5rem 0" }}>
                {assignmentsSearch ? "No matching assignments found" : "No business assignments configured"}
              </h3>
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: "0 0 1.25rem 0", maxWidth: "480px", marginInline: "auto" }}>
                {assignmentsSearch
                  ? "Try adjusting your search keywords or status filter."
                  : "Business assignments link customer organizations to delegated administrators, enabling scoped tenant management without platform-level privileges."}
              </p>
              {!assignmentsSearch && (
                <button
                  type="button"
                  onClick={openAssignModal}
                  className="btn btn-primary"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.45rem 1rem",
                    fontSize: "0.82rem",
                    backgroundColor: "var(--accent-emerald)",
                    color: "#ffffff",
                  }}
                >
                  <PlusCircle size={14} />
                  Assign First Business
                </button>
              )}
            </div>
          ) : (
            <div className="glass-panel" style={{ overflow: "hidden", marginBottom: "1.25rem" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-subtle)", backgroundColor: "rgba(255, 255, 255, 0.02)" }}>
                      <th style={{ padding: "0.75rem 1rem", color: "var(--text-muted)", fontWeight: 600 }}>Organization</th>
                      <th style={{ padding: "0.75rem 1rem", color: "var(--text-muted)", fontWeight: 600 }}>Delegated Admin</th>
                      <th style={{ padding: "0.75rem 1rem", color: "var(--text-muted)", fontWeight: 600 }}>Status</th>
                      <th style={{ padding: "0.75rem 1rem", color: "var(--text-muted)", fontWeight: 600 }}>Assigned At</th>
                      <th style={{ padding: "0.75rem 1rem", color: "var(--text-muted)", fontWeight: 600 }}>Assigned By</th>
                      <th style={{ padding: "0.75rem 1rem", color: "var(--text-muted)", fontWeight: 600, textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((assignment) => (
                      <tr
                        key={assignment.id}
                        style={{ borderBottom: "1px solid var(--border-subtle)", transition: "background-color 0.15s ease" }}
                        className="org-table-row"
                      >
                        {/* Organization */}
                        <td style={{ padding: "0.85rem 1rem" }}>
                          <div style={{ fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                            <Building2 size={15} style={{ color: "var(--accent-emerald)", flexShrink: 0 }} />
                            <span>{assignment.organization?.name || "Unknown Organization"}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "3px" }}>
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "monospace" }}>
                              {assignment.organization?.slug || assignment.organizationId}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(assignment.organizationId)}
                              style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "1px" }}
                              title="Copy Organization ID"
                              aria-label="Copy Organization ID"
                            >
                              {copiedId === assignment.organizationId ? <Check size={12} style={{ color: "var(--accent-emerald)" }} /> : <Copy size={12} />}
                            </button>
                          </div>
                        </td>

                        {/* Delegated Admin */}
                        <td style={{ padding: "0.85rem 1rem" }}>
                          <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                            {assignment.user?.firstName || ""} {assignment.user?.lastName || ""}
                          </div>
                          <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", fontFamily: "monospace", marginTop: "2px" }}>
                            {assignment.user?.email || assignment.userId}
                          </div>
                        </td>

                        {/* Status */}
                        <td style={{ padding: "0.85rem 1rem" }}>
                          {assignment.status === "ACTIVE" ? (
                            <span
                              className="badge"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                backgroundColor: "rgba(16, 185, 129, 0.15)",
                                color: "var(--accent-emerald)",
                                border: "1px solid rgba(16, 185, 129, 0.3)",
                                fontSize: "0.75rem",
                                padding: "0.25rem 0.55rem",
                              }}
                            >
                              <CheckCircle2 size={12} />
                              Active
                            </span>
                          ) : (
                            <span
                              className="badge"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                backgroundColor: "rgba(100, 116, 139, 0.15)",
                                color: "#94a3b8",
                                border: "1px solid rgba(100, 116, 139, 0.3)",
                                fontSize: "0.75rem",
                                padding: "0.25rem 0.55rem",
                              }}
                            >
                              <XCircle size={12} />
                              Revoked
                            </span>
                          )}
                          {assignment.assignmentReason && (
                            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "4px", maxWidth: "200px" }} title={assignment.assignmentReason}>
                              Reason: {assignment.assignmentReason}
                            </div>
                          )}
                        </td>

                        {/* Assigned At */}
                        <td style={{ padding: "0.85rem 1rem", color: "var(--text-secondary)", fontSize: "0.8rem", whiteSpace: "nowrap" }}>
                          <div>{new Date(assignment.assignedAt).toLocaleDateString()}</div>
                          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                            {new Date(assignment.assignedAt).toLocaleTimeString()}
                          </div>
                        </td>

                        {/* Assigned By */}
                        <td style={{ padding: "0.85rem 1rem", color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                          {assignment.assignedBy?.email || "Platform Master Admin"}
                        </td>

                        {/* Actions */}
                        <td style={{ padding: "0.85rem 1rem", textAlign: "right" }}>
                          {assignment.status === "ACTIVE" ? (
                            <button
                              type="button"
                              onClick={() => openRevokeModal(assignment)}
                              className="btn btn-secondary"
                              style={{
                                fontSize: "0.75rem",
                                padding: "0.3rem 0.65rem",
                                color: "#f87171",
                                borderColor: "rgba(239, 68, 68, 0.3)",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.35rem",
                              }}
                            >
                              <UserX size={13} />
                              Revoke
                            </button>
                          ) : (
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                              Revoked {assignment.revokedAt ? new Date(assignment.revokedAt).toLocaleDateString() : ""}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pagination Controls */}
          {assignmentsTotalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "1rem" }}>
              <button
                type="button"
                disabled={assignmentsPage <= 1 || loadingAssignments}
                onClick={() => loadAssignments(assignmentsPage - 1, assignmentsSearch, assignmentsStatusFilter)}
                className="btn btn-secondary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.82rem" }}
              >
                <ChevronLeft size={15} />
                Previous
              </button>
              <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                Page {assignmentsPage} of {assignmentsTotalPages}
              </span>
              <button
                type="button"
                disabled={assignmentsPage >= assignmentsTotalPages || loadingAssignments}
                onClick={() => loadAssignments(assignmentsPage + 1, assignmentsSearch, assignmentsStatusFilter)}
                className="btn btn-secondary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.82rem" }}
              >
                Next
                <ChevronRight size={15} />
              </button>
            </div>
          )}
        </section>
      )}

      {/* TAB 4: SHARED WHATSAPP PLATFORM */}
      {activeTab === "whatsapp" && (
        <section aria-labelledby="whatsapp-heading">
          {/* Status Header & Action Buttons */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
            <h2 id="whatsapp-heading" style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
              Shared WhatsApp Meta Infrastructure
            </h2>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                onClick={openConnectModal}
                disabled={isSubmittingConnect || isReverifying || isDisconnecting}
                className="btn btn-primary"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.4rem 0.85rem",
                  fontSize: "0.82rem",
                  backgroundColor: "var(--accent-emerald)",
                  color: "#ffffff",
                }}
              >
                <Key size={14} />
                {whatsappStatus?.connected ? "Update Credentials" : "Connect Platform WhatsApp"}
              </button>

              <button
                type="button"
                onClick={handleReverify}
                disabled={isReverifying || isSubmittingConnect || isDisconnecting || !whatsappStatus?.connected}
                className="btn btn-secondary"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.4rem 0.85rem",
                  fontSize: "0.82rem",
                }}
              >
                <RefreshCw size={14} className={isReverifying ? "animate-spin" : ""} />
                {isReverifying ? "Re-verifying..." : "Re-verify Connection"}
              </button>

              {whatsappStatus?.connected && (
                <button
                  type="button"
                  onClick={openDisconnectModal}
                  disabled={isDisconnecting || isReverifying || isSubmittingConnect}
                  className="btn btn-danger"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.4rem 0.85rem",
                    fontSize: "0.82rem",
                    backgroundColor: "rgba(239, 68, 68, 0.15)",
                    border: "1px solid rgba(239, 68, 68, 0.4)",
                    color: "#f87171",
                  }}
                >
                  <Unlink size={14} />
                  Disconnect
                </button>
              )}

              <button
                type="button"
                onClick={() => loadTemplates(true)}
                disabled={syncingTemplates}
                className="btn btn-secondary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0.85rem", fontSize: "0.82rem" }}
              >
                <RefreshCw size={14} className={syncingTemplates ? "animate-spin" : ""} />
                {syncingTemplates ? "Syncing from Meta..." : "Sync Templates from Meta"}
              </button>

              <button
                type="button"
                onClick={loadWhatsAppStatus}
                disabled={loadingWhatsApp || isReverifying}
                className="btn btn-secondary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0.85rem", fontSize: "0.82rem" }}
              >
                <RefreshCw size={14} className={loadingWhatsApp ? "animate-spin" : ""} />
                Refresh Status
              </button>
            </div>
          </div>

          {/* Feedback Banner (Success / Error / Info) */}
          {whatsappFeedback && (
            <div
              role="alert"
              className="glass-panel"
              style={{
                padding: "0.85rem 1.25rem",
                marginBottom: "1rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                border: whatsappFeedback.type === "success"
                  ? "1px solid rgba(16, 185, 129, 0.4)"
                  : whatsappFeedback.type === "error"
                  ? "1px solid rgba(239, 68, 68, 0.4)"
                  : "1px solid rgba(59, 130, 246, 0.4)",
                backgroundColor: whatsappFeedback.type === "success"
                  ? "rgba(16, 185, 129, 0.1)"
                  : whatsappFeedback.type === "error"
                  ? "rgba(239, 68, 68, 0.1)"
                  : "rgba(59, 130, 246, 0.1)",
                color: whatsappFeedback.type === "success"
                  ? "var(--accent-emerald)"
                  : whatsappFeedback.type === "error"
                  ? "#f87171"
                  : "#60a5fa",
                fontSize: "0.875rem",
                borderRadius: "8px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                {whatsappFeedback.type === "success" ? (
                  <CheckCircle2 size={16} />
                ) : whatsappFeedback.type === "error" ? (
                  <AlertCircle size={16} />
                ) : (
                  <Info size={16} />
                )}
                <span>{whatsappFeedback.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setWhatsappFeedback(null)}
                style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: "2px" }}
                aria-label="Dismiss feedback"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {whatsappError && (
            <div
              role="alert"
              className="glass-panel"
              style={{
                padding: "1rem",
                marginBottom: "1rem",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "#f87171",
                fontSize: "0.875rem",
              }}
            >
              {whatsappError}
            </div>
          )}

          {/* Connection Overview Card */}
          {whatsappStatus ? (
            <div className="glass-panel" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "8px",
                      backgroundColor: whatsappStatus.connected ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: whatsappStatus.connected ? "var(--accent-emerald)" : "#f87171",
                    }}
                  >
                    <Settings size={20} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                      {whatsappStatus.verifiedName || "Grovastra Platform Sender"}
                    </h3>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      Mode: {whatsappStatus.mode} ({whatsappStatus.source})
                    </span>
                  </div>
                </div>
                {getConnectionBadge(whatsappStatus)}
              </div>

              {/* Grid of Safe Platform Properties */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
                <div style={{ padding: "0.85rem 1rem", borderRadius: "6px", backgroundColor: "rgba(255, 255, 255, 0.03)" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
                    Display Phone Number
                  </div>
                  <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)", marginTop: "2px" }}>
                    {whatsappStatus.displayPhoneNumber || "Not Set"}
                  </div>
                </div>

                <div style={{ padding: "0.85rem 1rem", borderRadius: "6px", backgroundColor: "rgba(255, 255, 255, 0.03)" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
                    WABA ID
                  </div>
                  <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)", fontFamily: "monospace", marginTop: "2px" }}>
                    {whatsappStatus.wabaId ? `${whatsappStatus.wabaId.slice(0, 4)}...${whatsappStatus.wabaId.slice(-4)}` : "None"}
                  </div>
                </div>

                <div style={{ padding: "0.85rem 1rem", borderRadius: "6px", backgroundColor: "rgba(255, 255, 255, 0.03)" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
                    Token Status
                  </div>
                  <div
                    style={{
                      fontSize: "0.88rem",
                      fontWeight: 600,
                      color: whatsappStatus.status === "TOKEN_EXPIRED" || whatsappStatus.status === "REVOKED" ? "#f87171" : "var(--accent-emerald)",
                      marginTop: "2px",
                    }}
                  >
                    {whatsappStatus.status === "TOKEN_EXPIRED" || whatsappStatus.status === "REVOKED"
                      ? "Token Expired or Revoked"
                      : whatsappStatus.tokenExpiresAt
                      ? `Expires: ${new Date(whatsappStatus.tokenExpiresAt).toLocaleDateString()}`
                      : "Permanent System User Token"}
                  </div>
                </div>

                <div style={{ padding: "0.85rem 1rem", borderRadius: "6px", backgroundColor: "rgba(255, 255, 255, 0.03)" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
                    Last Meta Sync
                  </div>
                  <div style={{ fontSize: "0.88rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                    {whatsappStatus.lastSyncedAt ? new Date(whatsappStatus.lastSyncedAt).toLocaleString() : "Recently Verified"}
                  </div>
                </div>
              </div>

              {whatsappStatus.lastError && (
                <div
                  role="alert"
                  style={{
                    marginTop: "1rem",
                    padding: "0.75rem 1rem",
                    borderRadius: "6px",
                    backgroundColor: "rgba(239, 68, 68, 0.1)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    color: "#fca5a5",
                    fontSize: "0.82rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  <span><strong>Diagnostic Notice:</strong> {sanitizeErrorMessage(whatsappStatus.lastError)}</span>
                </div>
              )}
            </div>
          ) : !loadingWhatsApp ? (
            <div className="glass-panel" style={{ padding: "2rem", marginBottom: "1.5rem", textAlign: "center" }}>
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  backgroundColor: "rgba(255, 255, 255, 0.05)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 1rem auto",
                  color: "var(--text-muted)",
                }}
              >
                <Key size={24} />
              </div>
              <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)", margin: "0 0 0.5rem 0" }}>
                No Platform WhatsApp Account Connected
              </h3>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", maxWidth: "480px", margin: "0 auto 1.25rem auto" }}>
                Connect a verified WhatsApp Business Account (WABA) with Meta System User credentials to enable shared message broadcasts for all organizations.
              </p>
              <button
                type="button"
                onClick={openConnectModal}
                className="btn btn-primary"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.5rem 1rem",
                  fontSize: "0.85rem",
                  backgroundColor: "var(--accent-emerald)",
                  color: "#ffffff",
                }}
              >
                <Key size={14} />
                Connect Platform WhatsApp
              </button>
            </div>
          ) : null}

          {/* Templates Section */}
          <div className="glass-panel" style={{ padding: "1.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
              <div>
                <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                  Platform WhatsApp Templates
                </h3>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  Synchronized message templates available to tenants in SHARED_PLATFORM mode
                </span>
              </div>
              {templatesData?.summary && (
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <span className="badge badge-approved" style={{ fontSize: "0.78rem" }}>
                    {templatesData.summary.approvedCount} Approved
                  </span>
                  {templatesData.summary.pendingCount > 0 && (
                    <span className="badge badge-draft" style={{ fontSize: "0.78rem" }}>
                      {templatesData.summary.pendingCount} Pending
                    </span>
                  )}
                  {templatesData.summary.rejectedCount > 0 && (
                    <span className="badge badge-paused" style={{ fontSize: "0.78rem" }}>
                      {templatesData.summary.rejectedCount} Rejected
                    </span>
                  )}
                </div>
              )}
            </div>

            {loadingTemplates && (
              <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                <RefreshCw size={24} className="animate-spin" style={{ margin: "0 auto 0.5rem auto" }} />
                Loading templates...
              </div>
            )}

            {templatesError && (
              <div style={{ padding: "1rem", color: "#f87171", fontSize: "0.875rem" }}>
                {templatesError}
              </div>
            )}

            {templatesData && templatesData.templates.length === 0 && !loadingTemplates && (
              <div style={{ textAlign: "center", padding: "2.5rem", color: "var(--text-muted)", fontSize: "0.9rem" }}>
                No templates synchronized for the shared platform WABA yet. Click "Sync Templates from Meta" above.
              </div>
            )}

            {templatesData && templatesData.templates.length > 0 && (
              <div className="master-admin-table-container">
                <div className="master-admin-table-wrapper">
                  <table className="master-admin-table" aria-label="Platform Templates Table">
                    <thead>
                      <tr>
                        <th>Template Name</th>
                        <th>Category</th>
                        <th>Language</th>
                        <th>Status</th>
                        <th>Body Preview</th>
                      </tr>
                    </thead>
                    <tbody>
                      {templatesData.templates.map((tpl: PlatformTemplateItem) => (
                        <tr key={tpl.id}>
                          <td>
                            <div style={{ fontWeight: 600, color: "var(--text-primary)", fontFamily: "monospace" }}>
                              {tpl.name}
                            </div>
                          </td>
                          <td>
                            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{tpl.category}</span>
                          </td>
                          <td>
                            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
                              {tpl.language}
                            </span>
                          </td>
                          <td>
                            {tpl.status === "APPROVED" ? (
                              <span className="badge badge-approved" style={{ fontSize: "0.72rem" }}>
                                Approved
                              </span>
                            ) : (
                              <span className="badge badge-draft" style={{ fontSize: "0.72rem" }}>
                                {tpl.status}
                              </span>
                            )}
                          </td>
                          <td style={{ maxWidth: "340px" }}>
                            <div
                              style={{
                                fontSize: "0.8rem",
                                color: "var(--text-secondary)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                              title={tpl.body}
                            >
                              {tpl.body}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* TAB 5: ADMINS (DELEGATED ADMINS MANAGEMENT) */}
      {activeTab === "admins" && (
        <section aria-labelledby="admins-heading">
          {/* Header & Primary Actions */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
            <div>
              <h2 id="admins-heading" style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                Delegated Platform Administrators
              </h2>
              <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                Create and manage agency delegated administrators with scoped tenant access
              </span>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                onClick={openCreateAdminModal}
                className="btn btn-primary"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.4rem 0.85rem",
                  fontSize: "0.82rem",
                  backgroundColor: "var(--accent-emerald)",
                  color: "#ffffff",
                }}
              >
                <PlusCircle size={14} />
                Create Delegated Admin
              </button>
              <button
                type="button"
                onClick={loadAdmins}
                disabled={loadingAdmins}
                className="btn btn-secondary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0.85rem", fontSize: "0.82rem" }}
              >
                <RefreshCw size={14} className={loadingAdmins ? "animate-spin" : ""} />
                Refresh
              </button>
            </div>
          </div>

          {/* Feedback Banner (Success / Error / Info) */}
          {adminFeedback && (
            <div
              role="alert"
              className="glass-panel"
              style={{
                padding: "0.85rem 1.25rem",
                marginBottom: "1rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                border: adminFeedback.type === "success"
                  ? "1px solid rgba(16, 185, 129, 0.4)"
                  : adminFeedback.type === "error"
                  ? "1px solid rgba(239, 68, 68, 0.4)"
                  : "1px solid rgba(59, 130, 246, 0.4)",
                backgroundColor: adminFeedback.type === "success"
                  ? "rgba(16, 185, 129, 0.1)"
                  : adminFeedback.type === "error"
                  ? "rgba(239, 68, 68, 0.1)"
                  : "rgba(59, 130, 246, 0.1)",
                color: adminFeedback.type === "success"
                  ? "var(--accent-emerald)"
                  : adminFeedback.type === "error"
                  ? "#f87171"
                  : "#60a5fa",
                fontSize: "0.875rem",
                borderRadius: "8px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                {adminFeedback.type === "success" ? (
                  <CheckCircle2 size={16} />
                ) : adminFeedback.type === "error" ? (
                  <AlertCircle size={16} />
                ) : (
                  <Info size={16} />
                )}
                <span>{adminFeedback.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setAdminFeedback(null)}
                style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: "2px" }}
                aria-label="Dismiss feedback"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Filter Bar: Search & Admin Count */}
          <div
            className="glass-panel"
            style={{
              padding: "1rem 1.25rem",
              marginBottom: "1.25rem",
              display: "flex",
              flexWrap: "wrap",
              gap: "1rem",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ position: "relative", flex: 1, minWidth: "220px", maxWidth: "420px" }}>
              <Search
                size={16}
                style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}
              />
              <input
                type="text"
                placeholder="Search by name, email, or agency organization..."
                value={adminsSearch}
                onChange={(e) => setAdminsSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: adminsSearch.length > 0 ? "0.5rem 2.25rem 0.5rem 2.25rem" : "0.5rem 0.75rem 0.5rem 2.25rem",
                  borderRadius: "6px",
                  border: "1px solid var(--border-subtle)",
                  backgroundColor: "rgba(15, 23, 42, 0.6)",
                  color: "var(--text-primary)",
                  fontSize: "0.875rem",
                  boxSizing: "border-box",
                }}
              />
              {adminsSearch && (
                <button
                  onClick={() => setAdminsSearch("")}
                  style={{
                    position: "absolute",
                    right: "10px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: "2px",
                  }}
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
              Total: <strong style={{ color: "var(--text-primary)" }}>{admins.length}</strong> delegated admins
            </div>
          </div>

          {/* Error Message */}
          {adminsError && (
            <div
              role="alert"
              className="glass-panel"
              style={{
                padding: "1rem",
                marginBottom: "1rem",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "#f87171",
                fontSize: "0.875rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span>{adminsError}</span>
              <button
                type="button"
                onClick={() => setAdminsError(null)}
                style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer" }}
                aria-label="Dismiss error"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {/* Admins Table or Loading / Empty States */}
          {loadingAdmins ? (
            <div className="glass-panel" style={{ padding: "3rem 1rem", textAlign: "center", color: "var(--text-muted)" }}>
              <RefreshCw size={24} className="animate-spin" style={{ margin: "0 auto 0.75rem auto", display: "block" }} />
              <p style={{ margin: 0, fontSize: "0.875rem" }}>Loading delegated administrators...</p>
            </div>
          ) : admins.length === 0 ? (
            <div className="glass-panel" style={{ padding: "3rem 1.5rem", textAlign: "center" }}>
              <ShieldCheck size={36} style={{ color: "var(--text-muted)", margin: "0 auto 1rem auto", display: "block" }} />
              <h3 style={{ fontSize: "1.05rem", fontWeight: 600, color: "var(--text-primary)", margin: "0 0 0.5rem 0" }}>
                No delegated administrators configured
              </h3>
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: "0 0 1.25rem 0", maxWidth: "480px", marginInline: "auto" }}>
                Create delegated administrator accounts to enable external agency managers to operate assigned customer businesses without granting global platform permissions.
              </p>
              <button
                type="button"
                onClick={openCreateAdminModal}
                className="btn btn-primary"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.45rem 1rem",
                  fontSize: "0.82rem",
                  backgroundColor: "var(--accent-emerald)",
                  color: "#ffffff",
                }}
              >
                <PlusCircle size={14} />
                Create First Admin
              </button>
            </div>
          ) : (
            <div className="glass-panel" style={{ overflow: "hidden", marginBottom: "1.25rem" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-subtle)", backgroundColor: "rgba(255, 255, 255, 0.02)" }}>
                      <th style={{ padding: "0.75rem 1rem", color: "var(--text-muted)", fontWeight: 600 }}>Administrator</th>
                      <th style={{ padding: "0.75rem 1rem", color: "var(--text-muted)", fontWeight: 600 }}>Agency Container</th>
                      <th style={{ padding: "0.75rem 1rem", color: "var(--text-muted)", fontWeight: 600 }}>Platform Role</th>
                      <th style={{ padding: "0.75rem 1rem", color: "var(--text-muted)", fontWeight: 600 }}>Active Assignments</th>
                      <th style={{ padding: "0.75rem 1rem", color: "var(--text-muted)", fontWeight: 600 }}>Created Date</th>
                      <th style={{ padding: "0.75rem 1rem", color: "var(--text-muted)", fontWeight: 600, textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {admins
                      .filter((admin) => {
                        if (!adminsSearch.trim()) return true;
                        const term = adminsSearch.toLowerCase();
                        return (
                          admin.email.toLowerCase().includes(term) ||
                          admin.firstName.toLowerCase().includes(term) ||
                          Boolean(admin.lastName?.toLowerCase().includes(term)) ||
                          Boolean(admin.organizationName?.toLowerCase().includes(term))
                        );
                      })
                      .map((admin) => (
                        <tr
                          key={admin.id}
                          style={{ borderBottom: "1px solid var(--border-subtle)", transition: "background-color 0.15s ease" }}
                          className="org-table-row"
                        >
                          {/* Administrator Name & Email */}
                          <td style={{ padding: "0.85rem 1rem" }}>
                            <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                              {admin.firstName} {admin.lastName || ""}
                            </div>
                            <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", fontFamily: "monospace", marginTop: "2px" }}>
                              {admin.email}
                            </div>
                          </td>

                          {/* Agency Container */}
                          <td style={{ padding: "0.85rem 1rem" }}>
                            <div style={{ fontWeight: 500, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                              <Building2 size={14} style={{ color: "var(--accent-emerald)", flexShrink: 0 }} />
                              <span>{admin.organizationName || "Agency Container"}</span>
                            </div>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "monospace", marginTop: "2px" }}>
                              {admin.organizationId}
                            </div>
                          </td>

                          {/* Platform Role */}
                          <td style={{ padding: "0.85rem 1rem" }}>
                            <span
                              className="badge"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                backgroundColor: "rgba(99, 102, 241, 0.15)",
                                color: "#818cf8",
                                fontSize: "0.75rem",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontWeight: 600,
                              }}
                            >
                              <ShieldCheck size={12} />
                              {admin.platformRole}
                            </span>
                          </td>

                          {/* Active Assignments */}
                          <td style={{ padding: "0.85rem 1rem" }}>
                            {(admin.activeAssignmentsCount ?? 0) > 0 ? (
                              <span
                                className="badge"
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  backgroundColor: "rgba(16, 185, 129, 0.15)",
                                  color: "var(--accent-emerald)",
                                  fontSize: "0.75rem",
                                  padding: "2px 8px",
                                  borderRadius: "4px",
                                  fontWeight: 600,
                                }}
                              >
                                {admin.activeAssignmentsCount} assigned {admin.activeAssignmentsCount === 1 ? "org" : "orgs"}
                              </span>
                            ) : (
                              <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                                0 (Unassigned)
                              </span>
                            )}
                          </td>

                          {/* Created Date */}
                          <td style={{ padding: "0.85rem 1rem", color: "var(--text-secondary)", fontSize: "0.82rem" }}>
                            {admin.createdAt ? new Date(admin.createdAt).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            }) : "—"}
                          </td>

                          {/* Actions */}
                          <td style={{ padding: "0.85rem 1rem", textAlign: "right" }}>
                            <button
                              type="button"
                              onClick={() => handleCopy(admin.id)}
                              className="btn btn-secondary"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.35rem",
                                padding: "0.3rem 0.65rem",
                                fontSize: "0.75rem",
                              }}
                              title="Copy Admin User ID"
                              aria-label="Copy Admin User ID"
                            >
                              {copiedId === admin.id ? (
                                <Check size={12} style={{ color: "var(--accent-emerald)" }} />
                              ) : (
                                <Copy size={12} />
                              )}
                              <span>Copy ID</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* MODAL: ORGANIZATION DETAILS */}
      {selectedOrgId && (
        <div className="master-admin-modal-backdrop" onClick={() => setSelectedOrgId(null)}>
          <div className="master-admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="master-admin-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Building2 size={20} style={{ color: "var(--accent-emerald)" }} />
                <h3 style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                  {selectedOrgDetail?.name || "Organization Details"}
                </h3>
              </div>
              <button
                onClick={() => setSelectedOrgId(null)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
                aria-label="Close organization details"
              >
                <X size={20} />
              </button>
            </div>

            <div className="master-admin-modal-body">
              {loadingDetail && (
                <div style={{ textAlign: "center", padding: "2.5rem", color: "var(--text-muted)" }}>
                  <RefreshCw size={24} className="animate-spin" style={{ margin: "0 auto 0.5rem auto" }} />
                  Loading details...
                </div>
              )}

              {detailError && (
                <div style={{ padding: "1rem", color: "#f87171", fontSize: "0.875rem" }}>
                  {detailError}
                </div>
              )}

              {selectedOrgDetail && (
                <>
                  {/* Metadata Row */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: "0.75rem",
                      marginBottom: "1.25rem",
                    }}
                  >
                    <div style={{ padding: "0.75rem", borderRadius: "6px", backgroundColor: "rgba(255, 255, 255, 0.03)" }}>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase" }}>ID</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-primary)", fontFamily: "monospace", marginTop: "2px", wordBreak: "break-all" }}>
                        {selectedOrgDetail.id}
                      </div>
                    </div>
                    <div style={{ padding: "0.75rem", borderRadius: "6px", backgroundColor: "rgba(255, 255, 255, 0.03)" }}>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Slug</div>
                      <div style={{ fontSize: "0.85rem", color: "var(--text-primary)", fontWeight: 500, marginTop: "2px", wordBreak: "break-all" }}>
                        {selectedOrgDetail.slug}
                      </div>
                    </div>
                    <div style={{ padding: "0.75rem", borderRadius: "6px", backgroundColor: "rgba(255, 255, 255, 0.03)" }}>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Status</div>
                      <div style={{ marginTop: "2px" }}>
                        {selectedOrgDetail.isArchived ? (
                          <span className="badge badge-paused" style={{ fontSize: "0.72rem" }}>Archived</span>
                        ) : (
                          <span className="badge badge-approved" style={{ fontSize: "0.72rem" }}>Active</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Resource Counts - Responsive Auto-Fit Grid */}
                  <div style={{ marginBottom: "1.25rem" }}>
                    <h4 style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                      Resource Inventory
                    </h4>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
                        gap: "0.75rem",
                        textAlign: "center",
                      }}
                    >
                      <div style={{ padding: "0.75rem", borderRadius: "6px", backgroundColor: "rgba(255, 255, 255, 0.03)" }}>
                        <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--text-primary)" }}>{selectedOrgDetail.counts.campaigns}</div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Campaigns</div>
                      </div>
                      <div style={{ padding: "0.75rem", borderRadius: "6px", backgroundColor: "rgba(255, 255, 255, 0.03)" }}>
                        <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--text-primary)" }}>{selectedOrgDetail.counts.contacts}</div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Contacts</div>
                      </div>
                      <div style={{ padding: "0.75rem", borderRadius: "6px", backgroundColor: "rgba(255, 255, 255, 0.03)" }}>
                        <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--text-primary)" }}>{selectedOrgDetail.counts.contactLists}</div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Lists</div>
                      </div>
                      <div style={{ padding: "0.75rem", borderRadius: "6px", backgroundColor: "rgba(255, 255, 255, 0.03)" }}>
                        <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--text-primary)" }}>{selectedOrgDetail.counts.users}</div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Users</div>
                      </div>
                    </div>
                  </div>

                  {/* Associated Users Table with Horizontal Scroll & Wrapped Emails */}
                  <div>
                    <h4 style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                      Associated Users & Tenant Roles
                    </h4>
                    <div
                      style={{
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "6px",
                        overflowX: "auto",
                        WebkitOverflowScrolling: "touch",
                      }}
                    >
                      <table style={{ width: "100%", minWidth: "380px", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                        <thead>
                          <tr style={{ backgroundColor: "rgba(255, 255, 255, 0.03)", textAlign: "left" }}>
                            <th style={{ padding: "0.5rem 0.75rem", color: "var(--text-muted)" }}>User</th>
                            <th style={{ padding: "0.5rem 0.75rem", color: "var(--text-muted)" }}>Tenant Role</th>
                            <th style={{ padding: "0.5rem 0.75rem", color: "var(--text-muted)" }}>Platform Role</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedOrgDetail.users.map((u) => (
                            <tr key={u.id} style={{ borderTop: "1px solid rgba(255, 255, 255, 0.05)" }}>
                              <td style={{ padding: "0.5rem 0.75rem" }}>
                                <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                                  {u.firstName} {u.lastName || ""}
                                </div>
                                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", wordBreak: "break-word" }}>{u.email}</div>
                              </td>
                              <td style={{ padding: "0.5rem 0.75rem" }}>
                                <span className={`badge ${u.role === "OWNER" ? "badge-approved" : "badge-draft"}`} style={{ fontSize: "0.72rem" }}>
                                  {u.role}
                                </span>
                              </td>
                              <td style={{ padding: "0.5rem 0.75rem", color: "var(--text-muted)" }}>
                                {u.platformRole !== "NONE" ? (
                                  <span style={{ color: "#a5b4fc", fontWeight: 600 }}>{u.platformRole}</span>
                                ) : (
                                  "NONE"
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="master-admin-modal-footer">
              <button onClick={() => setSelectedOrgId(null)} className="btn btn-secondary" style={{ fontSize: "0.85rem" }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL: ARCHIVE / REACTIVATE */}
      {confirmActionOrg && (
        <div
          className="master-admin-modal-backdrop"
          onClick={() => {
            if (!actionSubmitting) setConfirmActionOrg(null);
          }}
        >
          <div className="master-admin-modal" style={{ maxWidth: "520px" }} onClick={(e) => e.stopPropagation()}>
            <div className="master-admin-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {confirmActionOrg.action === "archive" ? (
                  <AlertTriangle size={20} aria-hidden="true" focusable={false} style={{ color: "#f87171" }} />
                ) : (
                  <RotateCcw size={20} style={{ color: "var(--accent-emerald)" }} />
                )}
                <h3 style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                  {confirmActionOrg.action === "archive" ? "Confirm Deactivation & Archival" : "Confirm Organization Reactivation"}
                </h3>
              </div>
              <button
                onClick={() => {
                  if (!actionSubmitting) setConfirmActionOrg(null);
                }}
                disabled={actionSubmitting}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: actionSubmitting ? "not-allowed" : "pointer",
                }}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>

            <div className="master-admin-modal-body">
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.5, marginBottom: "1rem" }}>
                {confirmActionOrg.action === "archive" ? (
                  <>
                    Are you sure you want to deactivate and archive organization{" "}
                    <strong style={{ color: "var(--text-primary)" }}>{confirmActionOrg.org.name}</strong>?
                  </>
                ) : (
                  <>
                    Are you sure you want to reactivate organization{" "}
                    <strong style={{ color: "var(--text-primary)" }}>{confirmActionOrg.org.name}</strong>?
                  </>
                )}
              </p>

              <div
                style={{
                  padding: "0.85rem 1rem",
                  borderRadius: "6px",
                  backgroundColor: confirmActionOrg.action === "archive" ? "rgba(239, 68, 68, 0.08)" : "rgba(16, 185, 129, 0.08)",
                  border: `1px solid ${confirmActionOrg.action === "archive" ? "rgba(239, 68, 68, 0.25)" : "rgba(16, 185, 129, 0.25)"}`,
                  fontSize: "0.82rem",
                  color: "var(--text-secondary)",
                  lineHeight: 1.5,
                }}
              >
                {confirmActionOrg.action === "archive" ? (
                  <>
                    <strong>System Safeguards:</strong> Archival marks the tenant as soft-deleted and invalidates all active sessions for its users. Customer records, campaigns, contacts, consent history, and audit logs are <strong>never permanently deleted</strong>.
                  </>
                ) : (
                  <>
                    <strong>Reactivation:</strong> Reactivating restores tenant login and allows organization users to access the platform.
                  </>
                )}
              </div>
            </div>

            <div className="master-admin-modal-footer">
              <button
                onClick={() => {
                  if (!actionSubmitting) setConfirmActionOrg(null);
                }}
                disabled={actionSubmitting}
                className="btn btn-secondary"
                style={{ fontSize: "0.85rem", cursor: actionSubmitting ? "not-allowed" : "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={handleLifecycleAction}
                disabled={actionSubmitting}
                className={`btn ${confirmActionOrg.action === "archive" ? "btn-danger" : "btn-primary"}`}
                style={{
                  fontSize: "0.85rem",
                  backgroundColor: confirmActionOrg.action === "archive" ? "#dc2626" : "var(--accent-emerald)",
                  color: "#ffffff",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                {actionSubmitting && <RefreshCw size={14} className="animate-spin" />}
                {confirmActionOrg.action === "archive" ? "Archive Organization" : "Reactivate Organization"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL: CONNECT / UPDATE CREDENTIALS */}
      {isConnectModalOpen && (
        <div
          className="master-admin-modal-backdrop"
          onClick={closeConnectModal}
          role="presentation"
        >
          <div
            className="master-admin-modal"
            style={{ maxWidth: "560px" }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="connect-platform-modal-title"
            aria-describedby="connect-platform-modal-desc"
          >
            <div className="master-admin-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Key size={20} style={{ color: "var(--accent-emerald)" }} />
                <h3 id="connect-platform-modal-title" style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                  {whatsappStatus?.connected ? "Update Platform WhatsApp Credentials" : "Connect Platform WhatsApp Account"}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeConnectModal}
                disabled={isSubmittingConnect}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: isSubmittingConnect ? "not-allowed" : "pointer" }}
                aria-label="Close credentials modal"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleConnectSubmit} noValidate>
              <div className="master-admin-modal-body">
                <p id="connect-platform-modal-desc" style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: 0, marginBottom: "1.25rem", lineHeight: 1.5 }}>
                  Configure the shared WhatsApp Business Account (WABA) credentials used to dispatch template messages across all tenant organizations in <strong>SHARED_PLATFORM</strong> mode.
                </p>

                {whatsappStatus?.connected && (
                  <div
                    style={{
                      padding: "0.85rem 1rem",
                      borderRadius: "6px",
                      backgroundColor: "rgba(245, 158, 11, 0.12)",
                      border: "1px solid rgba(245, 158, 11, 0.35)",
                      color: "#fbbf24",
                      fontSize: "0.82rem",
                      marginBottom: "1.25rem",
                    }}
                  >
                    <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start" }}>
                      <AlertTriangle size={18} aria-hidden="true" focusable={false} style={{ flexShrink: 0, marginTop: "2px" }} />
                      <div>
                        <strong style={{ display: "block", color: "#fef3c7", marginBottom: "3px" }}>
                          Warning: Modifying Active Platform Integration
                        </strong>
                        <p style={{ margin: "0 0 8px 0", lineHeight: 1.45, color: "var(--text-secondary)" }}>
                          An active WhatsApp platform connection is currently established. Updating these credentials will replace the platform sender for all organizations and invalidate cached template catalogs.
                        </p>
                        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", color: "var(--text-primary)", fontWeight: 500, fontSize: "0.82rem" }}>
                          <input
                            type="checkbox"
                            id="confirm-overwrite-checkbox"
                            checked={confirmOverwrite}
                            onChange={(e) => setConfirmOverwrite(e.target.checked)}
                            disabled={isSubmittingConnect}
                          />
                          <span>I understand and confirm replacing the active platform credentials</span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {connectModalError && (
                  <div
                    role="alert"
                    style={{
                      padding: "0.75rem 1rem",
                      borderRadius: "6px",
                      backgroundColor: "rgba(239, 68, 68, 0.12)",
                      border: "1px solid rgba(239, 68, 68, 0.35)",
                      color: "#f87171",
                      fontSize: "0.82rem",
                      marginBottom: "1.25rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <AlertCircle size={16} style={{ flexShrink: 0 }} />
                    <span>{connectModalError}</span>
                  </div>
                )}

                {/* WABA ID Field */}
                <div style={{ marginBottom: "1rem" }}>
                  <label
                    htmlFor="platform-waba-id"
                    style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.35rem" }}
                  >
                    WhatsApp Business Account ID (WABA ID) <span style={{ color: "#f87171" }}>*</span>
                  </label>
                  <input
                    id="platform-waba-id"
                    type="text"
                    autoComplete="off"
                    value={connectWabaId}
                    onChange={(e) => setConnectWabaId(e.target.value)}
                    placeholder="e.g. 1075305975271164"
                    disabled={isSubmittingConnect}
                    aria-required="true"
                    style={{
                      width: "100%",
                      padding: "0.6rem 0.85rem",
                      fontSize: "0.875rem",
                      borderRadius: "6px",
                      border: "1px solid var(--border-subtle)",
                      backgroundColor: "rgba(255, 255, 255, 0.04)",
                      color: "var(--text-primary)",
                      fontFamily: "monospace",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                {/* Phone Number ID Field */}
                <div style={{ marginBottom: "1rem" }}>
                  <label
                    htmlFor="platform-phone-id"
                    style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.35rem" }}
                  >
                    Meta Phone Number ID <span style={{ color: "#f87171" }}>*</span>
                  </label>
                  <input
                    id="platform-phone-id"
                    type="text"
                    autoComplete="off"
                    value={connectPhoneNumberId}
                    onChange={(e) => setConnectPhoneNumberId(e.target.value)}
                    placeholder="e.g. 1290524220819472"
                    disabled={isSubmittingConnect}
                    aria-required="true"
                    style={{
                      width: "100%",
                      padding: "0.6rem 0.85rem",
                      fontSize: "0.875rem",
                      borderRadius: "6px",
                      border: "1px solid var(--border-subtle)",
                      backgroundColor: "rgba(255, 255, 255, 0.04)",
                      color: "var(--text-primary)",
                      fontFamily: "monospace",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                {/* Access Token Field - NEVER prefilled, password type with toggle */}
                <div style={{ marginBottom: "0.5rem" }}>
                  <label
                    htmlFor="platform-access-token"
                    style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.35rem" }}
                  >
                    Meta System User Access Token <span style={{ color: "#f87171" }}>*</span>
                  </label>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <input
                      id="platform-access-token"
                      type={showToken ? "text" : "password"}
                      autoComplete="off"
                      value={connectAccessToken}
                      onChange={(e) => setConnectAccessToken(e.target.value)}
                      placeholder="Paste permanent Meta System User token"
                      disabled={isSubmittingConnect}
                      aria-required="true"
                      style={{
                        width: "100%",
                        padding: "0.6rem 2.5rem 0.6rem 0.85rem",
                        fontSize: "0.875rem",
                        borderRadius: "6px",
                        border: "1px solid var(--border-subtle)",
                        backgroundColor: "rgba(255, 255, 255, 0.04)",
                        color: "var(--text-primary)",
                        boxSizing: "border-box",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      style={{
                        position: "absolute",
                        right: "8px",
                        background: "none",
                        border: "none",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        padding: "4px",
                      }}
                      aria-label={showToken ? "Hide access token" : "Show access token"}
                      aria-pressed={showToken}
                    >
                      {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginTop: "4px" }}>
                    Tokens are encrypted at rest with AES-256-GCM and never displayed in the UI.
                  </span>
                </div>
              </div>

              <div className="master-admin-modal-footer">
                <button
                  type="button"
                  onClick={closeConnectModal}
                  disabled={isSubmittingConnect}
                  className="btn btn-secondary"
                  style={{ fontSize: "0.85rem", cursor: isSubmittingConnect ? "not-allowed" : "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingConnect}
                  className="btn btn-primary"
                  style={{
                    fontSize: "0.85rem",
                    backgroundColor: "var(--accent-emerald)",
                    color: "#ffffff",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  {isSubmittingConnect && <RefreshCw size={14} className="animate-spin" />}
                  {isSubmittingConnect ? "Verifying with Meta..." : whatsappStatus?.connected ? "Update Credentials" : "Connect & Verify"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DISCONNECT PLATFORM WHATSAPP */}
      {isDisconnectModalOpen && (
        <div
          className="master-admin-modal-backdrop"
          onClick={closeDisconnectModal}
          role="presentation"
        >
          <div
            className="master-admin-modal"
            style={{ maxWidth: "520px" }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="disconnect-modal-title"
          >
            <div className="master-admin-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <AlertTriangle size={20} aria-hidden="true" focusable={false} style={{ color: "#f87171" }} />
                <h3 id="disconnect-modal-title" style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                  Disconnect Shared WhatsApp Account?
                </h3>
              </div>
              <button
                type="button"
                onClick={closeDisconnectModal}
                disabled={isDisconnecting}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: isDisconnecting ? "not-allowed" : "pointer" }}
                aria-label="Close disconnect dialog"
              >
                <X size={20} />
              </button>
            </div>

            <div className="master-admin-modal-body">
              <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.5, marginTop: 0, marginBottom: "1rem" }}>
                You are about to disconnect the Grovastra shared WhatsApp Business Account (WABA:{" "}
                <strong style={{ color: "var(--text-primary)", fontFamily: "monospace" }}>
                  {whatsappStatus?.wabaId || "configured account"}
                </strong>
                ).
              </p>

              <div
                style={{
                  padding: "0.85rem 1rem",
                  borderRadius: "6px",
                  backgroundColor: "rgba(239, 68, 68, 0.12)",
                  border: "1px solid rgba(239, 68, 68, 0.35)",
                  color: "#f87171",
                  fontSize: "0.82rem",
                  marginBottom: "1rem",
                }}
              >
                <strong>Operational Impact:</strong>
                <ul style={{ margin: "6px 0 0 0", paddingLeft: "1.2rem", lineHeight: 1.5 }}>
                  <li>Campaign dispatch and message sending will immediately halt for all tenant organizations relying on Shared Platform mode.</li>
                  <li>Stored credentials will be tombstoned and cannot be reused without entering fresh tokens.</li>
                  <li>Historical messages, contacts, campaigns, and webhook logs are securely preserved and will not be deleted.</li>
                </ul>
              </div>

              {disconnectError && (
                <div
                  role="alert"
                  style={{
                    padding: "0.75rem 1rem",
                    borderRadius: "6px",
                    backgroundColor: "rgba(239, 68, 68, 0.15)",
                    border: "1px solid rgba(239, 68, 68, 0.4)",
                    color: "#f87171",
                    fontSize: "0.82rem",
                    marginBottom: "1rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  <span>{disconnectError}</span>
                </div>
              )}
            </div>

            <div className="master-admin-modal-footer">
              <button
                type="button"
                onClick={closeDisconnectModal}
                disabled={isDisconnecting}
                className="btn btn-secondary"
                style={{ fontSize: "0.85rem", cursor: isDisconnecting ? "not-allowed" : "pointer" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDisconnectConfirm}
                disabled={isDisconnecting}
                className="btn btn-danger"
                style={{
                  fontSize: "0.85rem",
                  backgroundColor: "#dc2626",
                  color: "#ffffff",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                {isDisconnecting && <RefreshCw size={14} className="animate-spin" />}
                {isDisconnecting ? "Disconnecting..." : "Confirm Disconnect"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ASSIGN BUSINESS TO DELEGATED ADMIN */}
      {isAssignModalOpen && (
        <div
          className="master-admin-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeAssignModal();
          }}
          role="presentation"
        >
          <div
            className="master-admin-modal"
            style={{ maxWidth: "560px" }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="assign-modal-title"
          >
            <div className="master-admin-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <PlusCircle size={20} style={{ color: "var(--accent-emerald)" }} />
                <h3 id="assign-modal-title" style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                  Assign Organization to Delegated Administrator
                </h3>
              </div>
              <button
                type="button"
                onClick={closeAssignModal}
                disabled={isSubmittingAssign}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: isSubmittingAssign ? "not-allowed" : "pointer" }}
                aria-label="Close assignment dialog"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAssignSubmit} noValidate>
              <div className="master-admin-modal-body">
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: 0, marginBottom: "1.25rem", lineHeight: 1.5 }}>
                  Delegate customer organization access to an agency administrator (<code>DELEGATED_ADMIN</code>). The administrator will be granted management access to campaigns, contacts, templates, and analytics for this tenant only.
                </p>

                {assignModalError && (
                  <div
                    role="alert"
                    style={{
                      padding: "0.75rem 1rem",
                      borderRadius: "6px",
                      backgroundColor: "rgba(239, 68, 68, 0.12)",
                      border: "1px solid rgba(239, 68, 68, 0.35)",
                      color: "#f87171",
                      fontSize: "0.82rem",
                      marginBottom: "1.25rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <AlertCircle size={16} style={{ flexShrink: 0 }} />
                    <span>{assignModalError}</span>
                  </div>
                )}

                {/* Organization Selection */}
                <div style={{ marginBottom: "1rem" }}>
                  <label
                    htmlFor="assign-org-select"
                    style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.35rem" }}
                  >
                    Target Customer Organization <span style={{ color: "#f87171" }}>*</span>
                  </label>
                  <select
                    id="assign-org-select"
                    value={assignOrgId}
                    onChange={(e) => {
                      setAssignOrgId(e.target.value);
                      if (assignModalError) setAssignModalError(null);
                    }}
                    disabled={isSubmittingAssign}
                    required
                    style={{
                      width: "100%",
                      padding: "0.6rem 0.85rem",
                      fontSize: "0.875rem",
                      borderRadius: "6px",
                      border: "1px solid var(--border-subtle)",
                      backgroundColor: "rgba(15, 23, 42, 0.8)",
                      color: "var(--text-primary)",
                      boxSizing: "border-box",
                    }}
                  >
                    <option value="">-- Select an organization --</option>
                    {organizations
                      .filter((o) => !o.isArchived)
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name} ({o.slug})
                        </option>
                      ))}
                  </select>
                </div>

                {/* Delegated Admin Selection */}
                <div style={{ marginBottom: "1rem" }}>
                  <label
                    htmlFor="assign-user-select"
                    style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.35rem" }}
                  >
                    Delegated Administrator (DELEGATED_ADMIN) <span style={{ color: "#f87171" }}>*</span>
                    {loadingDelegatedAdmins && (
                      <span style={{ marginLeft: "6px", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        (loading...)
                      </span>
                    )}
                  </label>
                  {delegatedAdmins.length === 0 ? (
                    <div
                      style={{
                        padding: "0.75rem 1rem",
                        borderRadius: "6px",
                        backgroundColor: "rgba(245, 158, 11, 0.1)",
                        border: "1px solid rgba(245, 158, 11, 0.3)",
                        color: "#fbbf24",
                        fontSize: "0.82rem",
                      }}
                    >
                      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                        <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                        <span>No users currently hold the <code>DELEGATED_ADMIN</code> platform role. Promote an eligible user to DELEGATED_ADMIN before creating assignments.</span>
                      </div>
                    </div>
                  ) : (
                    <select
                      id="assign-user-select"
                      value={assignUserId}
                      onChange={(e) => {
                        setAssignUserId(e.target.value);
                        if (assignModalError) setAssignModalError(null);
                      }}
                      disabled={isSubmittingAssign}
                      required
                      style={{
                        width: "100%",
                        padding: "0.6rem 0.85rem",
                        fontSize: "0.875rem",
                        borderRadius: "6px",
                        border: "1px solid var(--border-subtle)",
                        backgroundColor: "rgba(15, 23, 42, 0.8)",
                        color: "var(--text-primary)",
                        boxSizing: "border-box",
                      }}
                    >
                      <option value="">-- Select a delegated administrator --</option>
                      {delegatedAdmins.map((admin) => (
                        <option key={admin.id} value={admin.id}>
                          {admin.firstName} {admin.lastName || ""} ({admin.email})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Assignment Reason (Optional) */}
                <div style={{ marginBottom: "0.5rem" }}>
                  <label
                    htmlFor="assign-reason"
                    style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.35rem" }}
                  >
                    Assignment Justification / Reason <span style={{ color: "var(--text-muted)", fontWeight: "normal" }}>(Optional)</span>
                  </label>
                  <textarea
                    id="assign-reason"
                    value={assignReason}
                    onChange={(e) => setAssignReason(e.target.value)}
                    placeholder="e.g. Agency retained for Q4 marketing operations and template management"
                    rows={3}
                    maxLength={500}
                    disabled={isSubmittingAssign}
                    style={{
                      width: "100%",
                      padding: "0.6rem 0.85rem",
                      fontSize: "0.875rem",
                      borderRadius: "6px",
                      border: "1px solid var(--border-subtle)",
                      backgroundColor: "rgba(255, 255, 255, 0.04)",
                      color: "var(--text-primary)",
                      boxSizing: "border-box",
                      resize: "vertical",
                    }}
                  />
                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block", marginTop: "3px" }}>
                    Logged for tenant security audits. Max 500 characters.
                  </span>
                </div>
              </div>

              <div className="master-admin-modal-footer">
                <button
                  type="button"
                  onClick={closeAssignModal}
                  disabled={isSubmittingAssign}
                  className="btn btn-secondary"
                  style={{ fontSize: "0.85rem", cursor: isSubmittingAssign ? "not-allowed" : "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAssign}
                  className="btn btn-primary"
                  style={{
                    fontSize: "0.85rem",
                    backgroundColor: "var(--accent-emerald)",
                    color: "#ffffff",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  {isSubmittingAssign && <RefreshCw size={14} className="animate-spin" />}
                  {isSubmittingAssign ? "Assigning..." : "Assign Business"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: REVOKE BUSINESS ASSIGNMENT */}
      {confirmRevokeAssignment && (
        <div
          className="master-admin-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeRevokeModal();
          }}
          role="presentation"
        >
          <div
            className="master-admin-modal"
            style={{ maxWidth: "520px" }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="revoke-modal-title"
          >
            <div className="master-admin-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <UserX size={20} style={{ color: "#f87171" }} />
                <h3 id="revoke-modal-title" style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                  Revoke Business Assignment
                </h3>
              </div>
              <button
                type="button"
                onClick={closeRevokeModal}
                disabled={isSubmittingRevoke}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: isSubmittingRevoke ? "not-allowed" : "pointer" }}
                aria-label="Close revoke dialog"
              >
                <X size={20} />
              </button>
            </div>

            <div className="master-admin-modal-body">
              <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.5, marginTop: 0, marginBottom: "1rem" }}>
                You are about to revoke delegated administrator access for organization{" "}
                <strong style={{ color: "var(--text-primary)" }}>
                  {confirmRevokeAssignment.organization?.name || "this organization"}
                </strong>{" "}
                assigned to{" "}
                <strong style={{ color: "var(--text-primary)", fontFamily: "monospace" }}>
                  {confirmRevokeAssignment.user?.email}
                </strong>
                .
              </p>

              <div
                style={{
                  padding: "0.85rem 1rem",
                  borderRadius: "6px",
                  backgroundColor: "rgba(239, 68, 68, 0.12)",
                  border: "1px solid rgba(239, 68, 68, 0.35)",
                  color: "#f87171",
                  fontSize: "0.82rem",
                  marginBottom: "1rem",
                }}
              >
                <strong>Security Impact:</strong>
                <p style={{ margin: "4px 0 0 0", lineHeight: 1.45 }}>
                  The delegated administrator will immediately lose access to this organization. Any ongoing requests will fail authorization checks with HTTP 403 Forbidden.
                </p>
              </div>

              {revokeModalError && (
                <div
                  role="alert"
                  style={{
                    padding: "0.75rem 1rem",
                    borderRadius: "6px",
                    backgroundColor: "rgba(239, 68, 68, 0.15)",
                    border: "1px solid rgba(239, 68, 68, 0.4)",
                    color: "#f87171",
                    fontSize: "0.82rem",
                    marginBottom: "1rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  <span>{revokeModalError}</span>
                </div>
              )}

              {/* Revocation Reason (Optional) */}
              <div style={{ marginTop: "0.5rem" }}>
                <label
                  htmlFor="revoke-reason"
                  style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.35rem" }}
                >
                  Reason for Revocation <span style={{ color: "var(--text-muted)", fontWeight: "normal" }}>(Optional)</span>
                </label>
                <textarea
                  id="revoke-reason"
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  placeholder="e.g. Contract completed, reassigning to different agency partner"
                  rows={2}
                  maxLength={500}
                  disabled={isSubmittingRevoke}
                  style={{
                    width: "100%",
                    padding: "0.6rem 0.85rem",
                    fontSize: "0.875rem",
                    borderRadius: "6px",
                    border: "1px solid var(--border-subtle)",
                    backgroundColor: "rgba(255, 255, 255, 0.04)",
                    color: "var(--text-primary)",
                    boxSizing: "border-box",
                    resize: "vertical",
                  }}
                />
              </div>
            </div>

            <div className="master-admin-modal-footer">
              <button
                type="button"
                onClick={closeRevokeModal}
                disabled={isSubmittingRevoke}
                className="btn btn-secondary"
                style={{ fontSize: "0.85rem", cursor: isSubmittingRevoke ? "not-allowed" : "pointer" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRevokeConfirm}
                disabled={isSubmittingRevoke}
                className="btn btn-danger"
                style={{
                  fontSize: "0.85rem",
                  backgroundColor: "#dc2626",
                  color: "#ffffff",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                {isSubmittingRevoke && <RefreshCw size={14} className="animate-spin" />}
                {isSubmittingRevoke ? "Revoking..." : "Confirm Revoke"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREATE DELEGATED ADMIN ACCOUNT */}
      {isCreateAdminModalOpen && (
        <div
          className="master-admin-modal-backdrop"
          onClick={closeCreateAdminModal}
          role="presentation"
        >
          <div
            className="master-admin-modal"
            style={{ maxWidth: "540px" }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-admin-modal-title"
          >
            <div className="master-admin-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <ShieldCheck size={20} style={{ color: "var(--accent-emerald)" }} />
                <h3 id="create-admin-modal-title" style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                  Create Delegated Administrator
                </h3>
              </div>
              <button
                type="button"
                onClick={closeCreateAdminModal}
                disabled={isSubmittingCreateAdmin}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: isSubmittingCreateAdmin ? "not-allowed" : "pointer" }}
                aria-label="Close dialog"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateAdminSubmit} noValidate>
              <div className="master-admin-modal-body">
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: 0, marginBottom: "1.25rem", lineHeight: 1.5 }}>
                  Provision a new agency administrator account (<code>DELEGATED_ADMIN</code>). You directly configure their initial login credentials. The administrator will be isolated to their own agency container until customer organizations are explicitly assigned in the Business Assignments tab.
                </p>

                {createAdminModalError && (
                  <div
                    role="alert"
                    style={{
                      padding: "0.75rem 1rem",
                      borderRadius: "6px",
                      backgroundColor: "rgba(239, 68, 68, 0.12)",
                      border: "1px solid rgba(239, 68, 68, 0.35)",
                      color: "#f87171",
                      fontSize: "0.82rem",
                      marginBottom: "1.25rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <AlertCircle size={16} style={{ flexShrink: 0 }} />
                    <span>{createAdminModalError}</span>
                  </div>
                )}

                {/* Name Row */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
                  <div>
                    <label
                      htmlFor="admin-first-name"
                      style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.35rem" }}
                    >
                      First Name <span style={{ color: "#f87171" }}>*</span>
                    </label>
                    <input
                      id="admin-first-name"
                      type="text"
                      value={createAdminFirstName}
                      onChange={(e) => setCreateAdminFirstName(e.target.value)}
                      placeholder="Jane"
                      disabled={isSubmittingCreateAdmin}
                      required
                      style={{
                        width: "100%",
                        padding: "0.6rem 0.85rem",
                        fontSize: "0.875rem",
                        borderRadius: "6px",
                        border: "1px solid var(--border-subtle)",
                        backgroundColor: "rgba(15, 23, 42, 0.8)",
                        color: "var(--text-primary)",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="admin-last-name"
                      style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.35rem" }}
                    >
                      Last Name <span style={{ color: "var(--text-muted)", fontWeight: "normal" }}>(Optional)</span>
                    </label>
                    <input
                      id="admin-last-name"
                      type="text"
                      value={createAdminLastName}
                      onChange={(e) => setCreateAdminLastName(e.target.value)}
                      placeholder="Doe"
                      disabled={isSubmittingCreateAdmin}
                      style={{
                        width: "100%",
                        padding: "0.6rem 0.85rem",
                        fontSize: "0.875rem",
                        borderRadius: "6px",
                        border: "1px solid var(--border-subtle)",
                        backgroundColor: "rgba(15, 23, 42, 0.8)",
                        color: "var(--text-primary)",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                </div>

                {/* Email Field */}
                <div style={{ marginBottom: "1rem" }}>
                  <label
                    htmlFor="admin-email"
                    style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.35rem" }}
                  >
                    Email Address <span style={{ color: "#f87171" }}>*</span>
                  </label>
                  <input
                    id="admin-email"
                    type="email"
                    value={createAdminEmail}
                    onChange={(e) => setCreateAdminEmail(e.target.value)}
                    placeholder="admin@agency.com"
                    disabled={isSubmittingCreateAdmin}
                    required
                    style={{
                      width: "100%",
                      padding: "0.6rem 0.85rem",
                      fontSize: "0.875rem",
                      borderRadius: "6px",
                      border: "1px solid var(--border-subtle)",
                      backgroundColor: "rgba(15, 23, 42, 0.8)",
                      color: "var(--text-primary)",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                {/* Password Field */}
                <div style={{ marginBottom: "1rem" }}>
                  <label
                    htmlFor="admin-password"
                    style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.35rem" }}
                  >
                    Account Password <span style={{ color: "#f87171" }}>*</span>
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      id="admin-password"
                      type={showAdminPassword ? "text" : "password"}
                      value={createAdminPassword}
                      onChange={(e) => setCreateAdminPassword(e.target.value)}
                      placeholder="Enter strong password (min 8 chars)"
                      disabled={isSubmittingCreateAdmin}
                      required
                      style={{
                        width: "100%",
                        padding: "0.6rem 2.5rem 0.6rem 0.85rem",
                        fontSize: "0.875rem",
                        borderRadius: "6px",
                        border: "1px solid var(--border-subtle)",
                        backgroundColor: "rgba(15, 23, 42, 0.8)",
                        color: "var(--text-primary)",
                        boxSizing: "border-box",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminPassword(!showAdminPassword)}
                      style={{
                        position: "absolute",
                        right: "10px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "none",
                        border: "none",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        padding: "2px",
                      }}
                      aria-label={showAdminPassword ? "Hide password" : "Show password"}
                    >
                      {showAdminPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px" }}>
                    Must be 8–128 characters, with at least one uppercase, one lowercase, and one numeric digit.
                  </div>
                </div>

                {/* Confirm Password Field */}
                <div style={{ marginBottom: "0.5rem" }}>
                  <label
                    htmlFor="admin-confirm-password"
                    style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.35rem" }}
                  >
                    Confirm Password <span style={{ color: "#f87171" }}>*</span>
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      id="admin-confirm-password"
                      type={showAdminConfirmPassword ? "text" : "password"}
                      value={createAdminConfirmPassword}
                      onChange={(e) => setCreateAdminConfirmPassword(e.target.value)}
                      placeholder="Re-enter chosen password"
                      disabled={isSubmittingCreateAdmin}
                      required
                      style={{
                        width: "100%",
                        padding: "0.6rem 2.5rem 0.6rem 0.85rem",
                        fontSize: "0.875rem",
                        borderRadius: "6px",
                        border: "1px solid var(--border-subtle)",
                        backgroundColor: "rgba(15, 23, 42, 0.8)",
                        color: "var(--text-primary)",
                        boxSizing: "border-box",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminConfirmPassword(!showAdminConfirmPassword)}
                      style={{
                        position: "absolute",
                        right: "10px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "none",
                        border: "none",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        padding: "2px",
                      }}
                      aria-label={showAdminConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                    >
                      {showAdminConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="master-admin-modal-footer">
                <button
                  type="button"
                  onClick={closeCreateAdminModal}
                  disabled={isSubmittingCreateAdmin}
                  className="btn btn-secondary"
                  style={{ fontSize: "0.85rem", cursor: isSubmittingCreateAdmin ? "not-allowed" : "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCreateAdmin || !createAdminFirstName.trim() || !createAdminEmail.trim() || !createAdminPassword || !createAdminConfirmPassword}
                  className="btn btn-primary"
                  style={{
                    fontSize: "0.85rem",
                    backgroundColor: "var(--accent-emerald)",
                    color: "#ffffff",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  {isSubmittingCreateAdmin && <RefreshCw size={14} className="animate-spin" />}
                  {isSubmittingCreateAdmin ? "Creating..." : "Create Delegated Admin"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
};
