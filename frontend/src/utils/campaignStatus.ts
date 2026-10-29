/**
 * Grovastra Frontend Campaign Status Presentation Utilities
 *
 * Provides customer-friendly status labels, badges, and helper text
 * without exposing internal queue IDs, WAMIDs, or technical stack traces.
 */

import { formatInBusinessTimezone } from "./timezone";

export interface CampaignStatusBadgeConfig {
  label: string;
  badgeClass: string;
  dotClass: string;
  isOverdue: boolean;
  helperText?: string;
}

export interface CampaignLike {
  status: string;
  approvalStatus?: string;
  rejectionReason?: string | null;
  scheduledAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  failedRecipients?: number;
  failedCount?: number;
  totalRecipients?: number;
  sentCount?: number;
  deliveredCount?: number;
  readCount?: number;
}

/**
 * Returns clean customer-facing badge configuration based on campaign status and timestamps.
 */
export function getCustomerCampaignStatus(campaign: CampaignLike): CampaignStatusBadgeConfig {
  const status = campaign.status?.toUpperCase() || "DRAFT";
  const approvalStatus = campaign.approvalStatus?.toUpperCase();
  const now = Date.now();

  if (approvalStatus === "REJECTED") {
    return {
      label: "Changes Requested",
      badgeClass: "bg-rose-500/10 text-rose-300 border-rose-500/30",
      dotClass: "bg-rose-400",
      isOverdue: false,
      helperText: campaign.rejectionReason
        ? `Reason: ${campaign.rejectionReason}`
        : "Campaign was rejected by admin. Please edit and resubmit.",
    };
  }

  if (approvalStatus === "PENDING") {
    return {
      label: "Pending Admin Approval",
      badgeClass: "bg-amber-500/10 text-amber-300 border-amber-500/30",
      dotClass: "bg-amber-400 animate-pulse",
      isOverdue: false,
      helperText: campaign.scheduledAt
        ? `Awaiting admin approval for dispatch at ${formatInBusinessTimezone(campaign.scheduledAt)}`
        : "Awaiting admin approval",
    };
  }

  if (status === "DELIVERY_CONFIRMATION_PENDING" || status === "SUBMITTED_UNCONFIRMED") {
    return {
      label: "Delivery confirmation pending",
      badgeClass: "bg-amber-500/10 text-amber-300 border-amber-500/30",
      dotClass: "bg-amber-400 animate-pulse",
      isOverdue: false,
      helperText: "Delivery confirmation pending webhook verification",
    };
  }

  if (status === "SCHEDULED") {
    const isOverdue = !!campaign.scheduledAt && new Date(campaign.scheduledAt).getTime() <= now;

    if (isOverdue) {
      return {
        label: "Scheduled time missed — waiting for dispatch",
        badgeClass: "bg-amber-500/10 text-amber-300 border-amber-500/30",
        dotClass: "bg-amber-400 animate-pulse",
        isOverdue: true,
        helperText: `Originally scheduled for ${formatInBusinessTimezone(campaign.scheduledAt)}`,
      };
    }

    return {
      label: "Scheduled",
      badgeClass: "bg-indigo-500/10 text-indigo-300 border-indigo-500/30",
      dotClass: "bg-indigo-400",
      isOverdue: false,
      helperText: `Scheduled for ${formatInBusinessTimezone(campaign.scheduledAt)}`,
    };
  }

  if (status === "QUEUED") {
    return {
      label: "Preparing messages",
      badgeClass: "bg-blue-500/10 text-blue-300 border-blue-500/30",
      dotClass: "bg-blue-400 animate-pulse",
      isOverdue: false,
      helperText: "Validating recipients and preparing dispatch queue",
    };
  }

  if (status === "SENDING") {
    return {
      label: "Sending",
      badgeClass: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
      dotClass: "bg-emerald-400 animate-ping",
      isOverdue: false,
      helperText: campaign.startedAt ? `Started ${formatInBusinessTimezone(campaign.startedAt)}` : undefined,
    };
  }

  if (status === "COMPLETED") {
    const failed = campaign.failedCount ?? campaign.failedRecipients ?? 0;
    const delivered = (campaign.deliveredCount ?? 0) + (campaign.readCount ?? 0);
    const sent = campaign.sentCount ?? 0;
    const total = campaign.totalRecipients ?? 0;

    // 1. Completed with issues: processing finished but one or more messages failed (or mixed outcome)
    if (failed > 0) {
      return {
        label: "Completed with issues",
        badgeClass: "bg-orange-500/10 text-orange-300 border-orange-500/30",
        dotClass: "bg-orange-400",
        isOverdue: false,
        helperText: `${failed} delivery issue(s) reported`,
      };
    }

    // 2. Delivery confirmation pending:
    // Rule 3: Do not classify ACCEPTED, SENT, or SUBMITTED_UNCONFIRMED as confirmed delivery.
    // Preserve the existing 'Delivery confirmation pending' presentation until a valid delivery webhook confirms delivery.
    const hasUnconfirmedDelivery =
      sent > 0 || (total > 0 && delivered < total && (campaign.sentCount !== undefined || campaign.deliveredCount !== undefined));

    if (hasUnconfirmedDelivery) {
      return {
        label: "Delivery confirmation pending",
        badgeClass: "bg-amber-500/10 text-amber-300 border-amber-500/30",
        dotClass: "bg-amber-400 animate-pulse",
        isOverdue: false,
        helperText: sent > 0
          ? `${sent} message(s) dispatched — awaiting delivery confirmation`
          : "Awaiting delivery confirmation from WhatsApp",
      };
    }

    // 3. Completed: all intended recipient messages reached defined successful terminal state (DELIVERED or READ)
    return {
      label: "Completed",
      badgeClass: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
      dotClass: "bg-emerald-400",
      isOverdue: false,
      helperText: campaign.completedAt
        ? `Finished ${formatInBusinessTimezone(campaign.completedAt)}`
        : total > 0
        ? "All messages confirmed delivered"
        : undefined,
    };
  }

  if (status === "FAILED") {
    return {
      label: "Failed",
      badgeClass: "bg-rose-500/10 text-rose-300 border-rose-500/30",
      dotClass: "bg-rose-400",
      isOverdue: false,
      helperText: "Campaign encountered an error during dispatch",
    };
  }

  if (status === "CANCELLED") {
    return {
      label: "Cancelled",
      badgeClass: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
      dotClass: "bg-zinc-400",
      isOverdue: false,
      helperText: "Campaign was cancelled before dispatch started",
    };
  }

  // Fallback: DRAFT
  return {
    label: "Draft",
    badgeClass: "bg-zinc-700/20 text-zinc-400 border-zinc-700/50",
    dotClass: "bg-zinc-400",
    isOverdue: false,
  };
}
