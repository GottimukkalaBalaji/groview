import React, { useState, useEffect, useCallback } from "react";
import { CampaignList } from "../components/CampaignList.js";
import { CampaignWizard } from "../components/CampaignWizard.js";
import { CampaignDetailsModal } from "../components/CampaignDetailsModal.js";
import { DeleteConfirmModal } from "../components/DeleteConfirmModal.js";
import { LaunchConfirmationModal } from "../components/LaunchConfirmationModal.js";
import { LaunchResultModal } from "../components/LaunchResultModal.js";
import { apiClient } from "../services/api.js";
import { Ban, X, Loader2 } from "lucide-react";
import { formatInBusinessTimezone } from "../utils/timezone.js";
import {
  Campaign,
  CampaignMetrics,
  CampaignPagination,
  CreateCampaignPayload,
  UpdateCampaignPayload,
  LaunchCampaignSummary,
  CampaignQueueRecoverySummary,
  SchedulerStatusResponse,
} from "../types/campaign.js";
import { PosterCampaignAttachment } from "../types/poster.js";

interface ToastNotification {
  id: string;
  message: string;
  type: "success" | "error";
}

export interface CampaignsPageProps {
  initialPosterAttachment?: PosterCampaignAttachment | null;
  onClearPosterAttachment?: () => void;
  currentUser?: any;
  userId?: string | null;
}

export const CampaignsPage: React.FC<CampaignsPageProps> = ({
  initialPosterAttachment,
  onClearPosterAttachment,
  currentUser,
  userId,
}) => {
  const [viewMode, setViewMode] = useState<"LIST" | "WIZARD">(() =>
    initialPosterAttachment ? "WIZARD" : "LIST"
  );
  const [posterAttachment, setPosterAttachment] = useState<PosterCampaignAttachment | null>(
    initialPosterAttachment || null
  );

  useEffect(() => {
    if (initialPosterAttachment) {
      setPosterAttachment(initialPosterAttachment);
      setViewMode("WIZARD");
    }
  }, [initialPosterAttachment]);

  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);

  // Campaign list state
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [metrics, setMetrics] = useState<CampaignMetrics>({
    total: 0,
    draft: 0,
    scheduled: 0,
    sending: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  });
  const [pagination, setPagination] = useState<CampaignPagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(10);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search with ~300ms Debounce
  const [searchInput, setSearchInput] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Track latest in-flight request to prevent race conditions on search/filter responses
  const activeRequestIdRef = React.useRef<number>(0);

  // Modals & Action States
  const [detailsCampaign, setDetailsCampaign] = useState<Campaign | null>(null);
  const [deletingCampaign, setDeletingCampaign] = useState<Campaign | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [toast, setToast] = useState<ToastNotification | null>(null);

  // Launch & Queue Recovery States
  const [launchingCampaign, setLaunchingCampaign] = useState<Campaign | null>(null);
  const [isLaunching, setIsLaunching] = useState<boolean>(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [launchSummary, setLaunchSummary] = useState<LaunchCampaignSummary | null>(null);
  const [recoverySummary, setRecoverySummary] = useState<CampaignQueueRecoverySummary | null>(null);
  const [isRetryingQueue, setIsRetryingQueue] = useState<boolean>(false);

  // Cancellation & Scheduler Status States
  const [cancellingCampaign, setCancellingCampaign] = useState<Campaign | null>(null);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatusResponse | null>(null);

  const fetchSchedulerStatus = useCallback(async () => {
    try {
      const res = await apiClient.getSchedulerStatus();
      if (res.success && res.data) {
        setSchedulerStatus(res.data);
      }
    } catch {
      // Non-critical background telemetry
    }
  }, []);

  useEffect(() => {
    fetchSchedulerStatus();
  }, [fetchSchedulerStatus]);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    const id = Date.now().toString();
    setToast({ id, message, type });
    setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, 4000);
  };

  // Debounce search query by 300ms and reset page to 1
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Fetch campaign list from API
  const fetchCampaigns = useCallback(async () => {
    const currentReqId = ++activeRequestIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiClient.listCampaigns({
        search: debouncedSearch.trim() || undefined,
        status: statusFilter !== "ALL" ? statusFilter : undefined,
        page,
        limit,
      });

      // Discard stale out-of-order responses
      if (currentReqId !== activeRequestIdRef.current) return;

      if (res.success && res.data) {
        setCampaigns(res.data.items);
        setMetrics(res.data.metrics);
        setPagination(res.data.pagination);
      } else {
        setError("Unable to retrieve campaigns from workspace API.");
      }
    } catch (err) {
      if (currentReqId !== activeRequestIdRef.current) return;
      setError(
        err instanceof Error
          ? err.message
          : "Unable to reach Grovastra campaign backend service."
      );
    } finally {
      if (currentReqId === activeRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [debouncedSearch, statusFilter, page, limit]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const handleStatusFilterChange = (status: string) => {
    setStatusFilter(status);
    setPage(1);
  };

  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit);
    setPage(1);
  };

  // Create & Edit Actions
  const handleOpenCreate = () => {
    setEditingCampaign(null);
    setViewMode("WIZARD");
  };

  const handleOpenEdit = (campaign: Campaign) => {
    setEditingCampaign(campaign);
    setViewMode("WIZARD");
  };

  const handleCancelWizard = () => {
    setEditingCampaign(null);
    setPosterAttachment(null);
    onClearPosterAttachment?.();
    setViewMode("LIST");
  };

  const handleSaveWizard = async (
    payload: CreateCampaignPayload | UpdateCampaignPayload,
    isEdit: boolean
  ) => {
    setIsSaving(true);
    try {
      if (isEdit && editingCampaign) {
        const res = await apiClient.updateCampaign(editingCampaign.id, payload as UpdateCampaignPayload);
        if (res.success) {
          showToast(`Campaign "${res.data.name}" updated successfully.`);
          setPosterAttachment(null);
          onClearPosterAttachment?.();
          setViewMode("LIST");
          setEditingCampaign(null);
          await fetchCampaigns();
        }
      } else {
        const res = await apiClient.createCampaign(payload as CreateCampaignPayload);
        if (res.success) {
          showToast(`Campaign draft "${res.data.name}" created successfully.`);
          setPosterAttachment(null);
          onClearPosterAttachment?.();
          setViewMode("LIST");
          setEditingCampaign(null);
          await fetchCampaigns();
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to persist campaign draft.";
      showToast(msg, "error");
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  // Duplicate Action
  const handleDuplicate = async (campaign: Campaign) => {
    try {
      const res = await apiClient.duplicateCampaign(campaign.id);
      if (res.success) {
        showToast(`Draft duplicated as "${res.data.name}".`);
        await fetchCampaigns();
      }
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to duplicate campaign.",
        "error"
      );
    }
  };

  // View Details Action (fetches fresh tenant-scoped message delivery counts from getCampaignById)
  const handleViewDetails = async (campaign: Campaign) => {
    setDetailsCampaign(campaign);
    try {
      const res = await apiClient.getCampaign(campaign.id);
      if (res.success && res.data) {
        setDetailsCampaign(res.data);
      }
    } catch {
      // Keep existing detailsCampaign if network fetch fails
    }
  };

  // Delete Action
  const handleDeleteConfirm = async () => {
    if (!deletingCampaign) return;
    setIsDeleting(true);
    try {
      const res = await apiClient.deleteCampaign(deletingCampaign.id);
      if (res.success) {
        showToast(`Campaign draft "${deletingCampaign.name}" removed.`);
        setDeletingCampaign(null);
        await fetchCampaigns();
      }
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to delete campaign draft.",
        "error"
      );
    } finally {
      setIsDeleting(false);
    }
  };

  // Launch Actions
  const handleOpenLaunch = (campaign: Campaign) => {
    setLaunchingCampaign(campaign);
    setLaunchError(null);
  };

  const handleConfirmLaunch = async () => {
    if (!launchingCampaign) return;
    setIsLaunching(true);
    setLaunchError(null);
    try {
      const res = await apiClient.sendCampaign(launchingCampaign.id);
      if (res.success && res.data) {
        setLaunchSummary(res.data);
        setLaunchingCampaign(null);
        showToast(`Campaign "${res.data.campaignName}" queued for dispatch.`);
        await fetchCampaigns();
      }
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while queueing the campaign.";
      setLaunchError(errorMsg);
    } finally {
      setIsLaunching(false);
    }
  };

  const handleRetryQueue = async (campaign: Campaign) => {
    setIsRetryingQueue(true);
    try {
      const res = await apiClient.retryCampaignQueue(campaign.id);
      if (res.success && res.data) {
        setRecoverySummary(res.data);
        showToast(`Queue recovery completed for "${campaign.name}".`);
        await fetchCampaigns();
      }
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Queue recovery failed.";
      showToast(errorMsg, "error");
    } finally {
      setIsRetryingQueue(false);
    }
  };

  const handleRetryFromLaunchResult = async () => {
    const campaignId = launchSummary?.campaignId || recoverySummary?.campaignId;
    if (!campaignId) return;
    setIsRetryingQueue(true);
    try {
      const res = await apiClient.retryCampaignQueue(campaignId);
      if (res.success && res.data) {
        setRecoverySummary(res.data);
        setLaunchSummary(null);
        showToast("Queue recovery completed successfully.");
        await fetchCampaigns();
      }
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Queue recovery failed.";
      showToast(errorMsg, "error");
    } finally {
      setIsRetryingQueue(false);
    }
  };

  const handleCancelCampaign = (campaign: Campaign) => {
    setCancellingCampaign(campaign);
  };

  const handleConfirmCancel = async () => {
    if (!cancellingCampaign) return;
    setIsCancelling(true);
    try {
      const res = await apiClient.cancelCampaign(cancellingCampaign.id);
      if (res.success) {
        showToast(`Campaign "${cancellingCampaign.name}" was cancelled successfully.`);
        setCancellingCampaign(null);
        await fetchCampaigns();
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to cancel campaign", "error");
    } finally {
      setIsCancelling(false);
    }
  };

  const handleLaunchFromWizard = async (
    payload: CreateCampaignPayload | UpdateCampaignPayload,
    isEdit: boolean
  ) => {
    let targetCampaignId = editingCampaign?.id;
    let campaignName = payload.name;
    if (isEdit && editingCampaign) {
      const updateRes = await apiClient.updateCampaign(editingCampaign.id, payload as UpdateCampaignPayload);
      if (!updateRes.success) throw new Error("Failed to update campaign draft before launch.");
      campaignName = updateRes.data.name;
    } else {
      const createRes = await apiClient.createCampaign(payload as CreateCampaignPayload);
      if (!createRes.success) throw new Error("Failed to create campaign draft before launch.");
      targetCampaignId = createRes.data.id;
      campaignName = createRes.data.name;
    }

    if (!targetCampaignId) throw new Error("Campaign ID missing for dispatch.");

    // If campaign is scheduled for later, do not dispatch immediately
    if (payload.scheduledAt) {
      setViewMode("LIST");
      setEditingCampaign(null);
      showToast(
        `Campaign "${campaignName}" scheduled for ${formatInBusinessTimezone(payload.scheduledAt)}.`
      );
      await fetchCampaigns();
      return;
    }

    // Otherwise, launch immediately
    const sendRes = await apiClient.sendCampaign(targetCampaignId);
    if (sendRes.success && sendRes.data) {
      setLaunchSummary(sendRes.data);
      setViewMode("LIST");
      setEditingCampaign(null);
      showToast(`Campaign "${sendRes.data.campaignName}" queued for dispatch.`);
      await fetchCampaigns();
    }
  };

  return (
    <div className="campaigns-page-wrapper">
      {/* Toast Notification Banner */}
      {toast && (
        <div className={`toast-notification toast-${toast.type}`} role="status">
          <span>{toast.message}</span>
          <button
            type="button"
            className="toast-close-btn"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}

      {viewMode === "LIST" ? (
        <>
          {schedulerStatus && (
            <div
              className="scheduler-operational-banner"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.6rem 1rem",
                marginBottom: "1rem",
                borderRadius: "var(--radius-md)",
                background: schedulerStatus.workerActive
                  ? "rgba(16, 185, 129, 0.08)"
                  : "rgba(245, 158, 11, 0.08)",
                border: schedulerStatus.workerActive
                  ? "1px solid rgba(16, 185, 129, 0.25)"
                  : "1px solid rgba(245, 158, 11, 0.25)",
                fontSize: "0.82rem",
              }}
              data-testid="scheduler-operational-banner"
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: schedulerStatus.workerActive ? "var(--accent-emerald)" : "var(--accent-amber)",
                    display: "inline-block",
                  }}
                />
                <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                  Automatic Dispatch:{" "}
                  <strong style={{ color: schedulerStatus.workerActive ? "var(--accent-emerald)" : "#fbbf24" }}>
                    {schedulerStatus.workerActive
                      ? "Active (Worker Running)"
                      : "Dormant (Worker Inactive — Safety Mode)"}
                  </strong>
                </span>
              </div>
              <span style={{ color: "var(--text-secondary)", fontSize: "0.76rem" }}>
                {schedulerStatus.workerActive
                  ? "Scheduled campaigns dispatch automatically when due."
                  : "Due campaigns wait safely until dispatch worker is enabled."}
              </span>
            </div>
          )}

          <CampaignList
            campaigns={campaigns}
            metrics={metrics}
            pagination={pagination}
            onPageChange={setPage}
            onLimitChange={handleLimitChange}
            isLoading={isLoading}
            error={error}
            searchTerm={searchInput}
            onSearchChange={setSearchInput}
            statusFilter={statusFilter}
            onStatusFilterChange={handleStatusFilterChange}
            onRefresh={fetchCampaigns}
            onCreateCampaign={handleOpenCreate}
            onEditCampaign={handleOpenEdit}
            onDuplicateCampaign={handleDuplicate}
            onViewDetails={handleViewDetails}
            onDeleteCampaign={setDeletingCampaign}
            onLaunchCampaign={handleOpenLaunch}
            onRetryQueue={handleRetryQueue}
            onCancelCampaign={handleCancelCampaign}
          />
        </>
      ) : (
        <CampaignWizard
          initialCampaign={editingCampaign}
          posterAttachment={posterAttachment}
          userId={userId || currentUser?.id}
          onRemovePosterAttachment={() => {
            setPosterAttachment(null);
            onClearPosterAttachment?.();
          }}
          onSave={handleSaveWizard}
          onCancel={handleCancelWizard}
          isSaving={isSaving}
          onLaunch={handleLaunchFromWizard}
        />
      )}

      {/* Campaign Details Inspection Modal */}
      <CampaignDetailsModal
        isOpen={Boolean(detailsCampaign)}
        campaign={detailsCampaign}
        onClose={() => setDetailsCampaign(null)}
        onEdit={handleOpenEdit}
        onDuplicate={handleDuplicate}
        onLaunch={handleOpenLaunch}
        onRetryQueue={handleRetryQueue}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmModal
        isOpen={Boolean(deletingCampaign)}
        campaignName={deletingCampaign?.name || ""}
        isDeleting={isDeleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingCampaign(null)}
      />

      {/* Launch Confirmation Modal */}
      <LaunchConfirmationModal
        isOpen={Boolean(launchingCampaign)}
        campaign={launchingCampaign}
        isLaunching={isLaunching}
        launchError={launchError}
        onConfirm={handleConfirmLaunch}
        onCancel={() => {
          setLaunchingCampaign(null);
          setLaunchError(null);
        }}
        eligibleCount={launchingCampaign?.totalRecipients}
      />

      {/* Launch Result / Queue Recovery Modal */}
      <LaunchResultModal
        isOpen={Boolean(launchSummary || recoverySummary)}
        onClose={() => {
          setLaunchSummary(null);
          setRecoverySummary(null);
        }}
        launchSummary={launchSummary}
        recoverySummary={recoverySummary}
        onRetryQueue={handleRetryFromLaunchResult}
        isRetryingQueue={isRetryingQueue}
      />

      {/* Cancel Scheduled Campaign Confirmation Modal */}
      {cancellingCampaign && (
        <div
          className="modal-backdrop"
          onClick={() => !isCancelling && setCancellingCampaign(null)}
          data-testid="cancel-campaign-modal-backdrop"
        >
          <div
            className="modal-card confirm-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-dialog-title"
            style={{ maxWidth: "480px" }}
          >
            <div className="modal-header">
              <div className="modal-icon-danger">
                <Ban size={20} color="var(--accent-amber)" />
              </div>
              <div style={{ flex: 1 }}>
                <h3 id="cancel-dialog-title" className="modal-title">
                  Cancel Scheduled Campaign?
                </h3>
                <span className="modal-sub">
                  Prevent automatic dispatch before sending starts
                </span>
              </div>
              <button
                type="button"
                className="btn-icon-close"
                onClick={() => setCancellingCampaign(null)}
                disabled={isCancelling}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-text">
                Are you sure you want to cancel campaign <strong>"{cancellingCampaign.name}"</strong>?
                {cancellingCampaign.scheduledAt && (
                  <>
                    <br />
                    Originally scheduled for:{" "}
                    <strong>{formatInBusinessTimezone(cancellingCampaign.scheduledAt)}</strong>.
                  </>
                )}
                <br />
                It will transition to <strong>CANCELLED</strong> and will not be sent to WhatsApp recipients.
              </p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setCancellingCampaign(null)}
                disabled={isCancelling}
                id="keep-campaign-btn"
              >
                Keep Scheduled
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={handleConfirmCancel}
                disabled={isCancelling}
                id="confirm-cancel-campaign-btn"
                style={{ minWidth: "150px" }}
              >
                {isCancelling ? (
                  <>
                    <Loader2 size={14} className="spinning" />
                    <span>Cancelling...</span>
                  </>
                ) : (
                  <>
                    <Ban size={14} />
                    <span>Confirm Cancel</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
