import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { AnalyticsPage } from "../pages/AnalyticsPage.js";
import { apiClient } from "../services/api.js";
import { AnalyticsOverview, DeliveryReportResponse } from "../types/analytics.js";

const mockOverview: AnalyticsOverview = {
  dateRange: {
    startDate: "2026-09-17T00:00:00.000Z",
    endDate: "2026-10-17T23:59:59.999Z",
    timeRange: "30d",
  },
  summary: {
    totalCampaigns: 12,
    draftCampaigns: 2,
    scheduledCampaigns: 1,
    queuedCampaigns: 1,
    sendingCampaigns: 1,
    completedCampaigns: 5,
    completedWithIssuesCampaigns: 1,
    failedCampaigns: 1,
    cancelledCampaigns: 0,
    totalIntendedRecipients: 1500,
    queuedMessages: 10,
    acceptedMessages: 15,
    sentMessages: 20,
    deliveredMessages: 1100,
    readMessages: 320,
    failedMessages: 25,
    deliveryConfirmationPendingMessages: 45,
    totalMessages: 1490,
  },
  rates: {
    deliveryRate: {
      rate: 98.3,
      numerator: 1420,
      denominator: 1445,
      definition: "Confirmed delivered or read messages divided by eligible dispatched messages",
      formula: "(delivered + read) / (delivered + read + failed)",
    },
    readRate: {
      rate: 22.5,
      numerator: 320,
      denominator: 1420,
      definition: "Confirmed read messages divided by confirmed delivered messages",
      formula: "read / (delivered + read)",
    },
    failureRate: {
      rate: 1.7,
      numerator: 25,
      denominator: 1445,
      definition: "Failed messages divided by attempted dispatches",
      formula: "failed / attempted",
    },
  },
  trends: {
    campaignVolumeOverTime: [
      { date: "2026-10-15", total: 3, completed: 2, failed: 0, scheduled: 1 },
      { date: "2026-10-16", total: 5, completed: 4, failed: 1, scheduled: 0 },
    ],
    messageVolumeOverTime: [
      { date: "2026-10-15", sent: 50, delivered: 45, read: 15, failed: 1, queued: 0 },
      { date: "2026-10-16", sent: 80, delivered: 75, read: 25, failed: 2, queued: 0 },
    ],
    ratesOverTime: [
      { date: "2026-10-15", deliveryRate: 97.8, readRate: 33.3, failureRate: 2.2 },
      { date: "2026-10-16", deliveryRate: 98.0, readRate: 33.3, failureRate: 2.0 },
    ],
    campaignStatusDistribution: [
      { status: "COMPLETED", label: "Completed", count: 5, percentage: 41.7 },
      { status: "COMPLETED_WITH_ISSUES", label: "Completed with issues", count: 1, percentage: 8.3 },
      { status: "DRAFT", label: "Draft", count: 2, percentage: 16.7 },
      { status: "SCHEDULED", label: "Scheduled", count: 1, percentage: 8.3 },
      { status: "FAILED", label: "Failed", count: 1, percentage: 8.3 },
    ],
    failureReasonsDistribution: [
      { code: "131026", reason: "Receiver phone number not registered on WhatsApp", count: 20, percentage: 80.0 },
      { code: "131047", reason: "Spam rate limit encountered", count: 5, percentage: 20.0 },
    ],
  },
  scheduling: {
    upcomingCount: 1,
    overdueCount: 0,
    dispatchedLateCount: 1,
    cancelledExpiredCount: 0,
    upcomingCampaigns: [
      {
        id: "camp_future_1",
        name: "Upcoming Festive Blast",
        scheduledAt: "2026-10-20T10:00:00.000Z",
        totalRecipients: 250,
      },
    ],
    overdueCampaigns: [],
    dispatchedLateCampaigns: [
      {
        id: "camp_late_1",
        name: "Morning Broadcast",
        scheduledAt: "2026-10-16T08:00:00.000Z",
        startedAt: "2026-10-16T08:04:15.000Z",
        latencySeconds: 255,
      },
    ],
    comparisons: [
      {
        id: "camp_late_1",
        name: "Morning Broadcast",
        scheduledAt: "2026-10-16T08:00:00.000Z",
        startedAt: "2026-10-16T08:04:15.000Z",
        status: "COMPLETED",
        latencySeconds: 255,
      },
    ],
    restartRecovery: {
      isAvailable: false,
      historicalCount: null,
      status: "UNAVAILABLE",
      reason: "Historical process restarts and in-flight job reconciliation events are currently logged as ephemeral operational events in application stdout/runtime logs and are not persisted as database event records.",
      additiveDesignProposal: "CREATE TABLE system_recovery_logs (id TEXT PRIMARY KEY, event_type TEXT, recovered_count INT, created_at TIMESTAMP);",
    },
  },
};

const mockReport: DeliveryReportResponse = {
  items: [
    {
      id: "msg_rep_1",
      campaignId: "c1",
      campaignName: "Diwali Offer",
      recipientPhoneMasked: "+9198••••••10",
      templateName: "festive_promo",
      templateLanguage: "en_US",
      status: "READ",
      attemptCount: 1,
      errorCode: null,
      errorMessage: null,
      dispatchedAt: "2026-10-16T08:00:05.000Z",
      deliveredAt: "2026-10-16T08:00:08.000Z",
      readAt: "2026-10-16T08:05:00.000Z",
      failedAt: null,
      createdAt: "2026-10-16T07:59:00.000Z",
    },
    {
      id: "msg_rep_2",
      campaignId: "c1",
      campaignName: "Diwali Offer",
      recipientPhoneMasked: "+9191••••••99",
      templateName: "festive_promo",
      templateLanguage: "en_US",
      status: "FAILED",
      attemptCount: 3,
      errorCode: "131026",
      errorMessage: "Receiver phone number not registered on WhatsApp",
      dispatchedAt: "2026-10-16T08:00:05.000Z",
      deliveredAt: null,
      readAt: null,
      failedAt: "2026-10-16T08:00:15.000Z",
      createdAt: "2026-10-16T07:59:00.000Z",
    },
  ],
  total: 2,
  page: 1,
  limit: 15,
  totalPages: 1,
};

describe("AnalyticsPage Frontend Component", () => {
  beforeEach(() => {
    vi.spyOn(apiClient, "listCampaigns").mockResolvedValue({
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        items: [
          {
            id: "c1",
            name: "Diwali Offer",
            status: "COMPLETED",
          } as any,
        ],
        pagination: {
          total: 1,
          page: 1,
          limit: 100,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        },
        metrics: {
          total: 1,
          draft: 0,
          scheduled: 0,
          sending: 0,
          completed: 1,
          failed: 0,
          cancelled: 0,
        },
      },
    });

    vi.spyOn(apiClient, "getAnalyticsOverview").mockResolvedValue({
      success: true,
      timestamp: new Date().toISOString(),
      data: mockOverview,
    });

    vi.spyOn(apiClient, "getDeliveryReport").mockResolvedValue({
      success: true,
      timestamp: new Date().toISOString(),
      data: mockReport,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders page header and time range selectors", async () => {
    render(<AnalyticsPage />);

    expect(screen.getByText("Customer Campaign Analytics")).toBeDefined();
    expect(screen.getByText("7 Days")).toBeDefined();
    expect(screen.getByText("30 Days")).toBeDefined();
    expect(screen.getByText("90 Days")).toBeDefined();
    expect(screen.getByText("All Time")).toBeDefined();

    await waitFor(() => {
      expect(screen.getByTestId("delivery-rate-card")).toBeDefined();
    });
  });

  it("renders 3 primary rate cards with exact percentages and denominator definitions", async () => {
    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText("98.3%")).toBeDefined(); // Delivery rate
      expect(screen.getByText("22.5%")).toBeDefined(); // Read rate
      expect(screen.getByText("1.7%")).toBeDefined();  // Failure rate
    });

    // Numerator / denominator labels
    expect(screen.getByText("1420 / 1445 confirmed")).toBeDefined();
    expect(screen.getByText("320 / 1420 read")).toBeDefined();
    expect(screen.getByText("25 / 1445 failed")).toBeDefined();
  });

  it("renders all 17 distinct summary metric cards with zero double counting", async () => {
    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("metric-total-campaigns")).toBeDefined();
    });

    // Campaign lifecycle cards
    expect(screen.getByTestId("metric-draft-campaigns")).toHaveTextContent("2");
    expect(screen.getByTestId("metric-scheduled-campaigns")).toHaveTextContent("1");
    expect(screen.getByTestId("metric-queued-campaigns")).toHaveTextContent("1");
    expect(screen.getByTestId("metric-sending-campaigns")).toHaveTextContent("1");
    expect(screen.getByTestId("metric-completed-campaigns")).toHaveTextContent("5");
    expect(screen.getByTestId("metric-completed-issues")).toHaveTextContent("1");
    expect(screen.getByTestId("metric-failed-campaigns")).toHaveTextContent("1");
    expect(screen.getByTestId("metric-cancelled-campaigns")).toHaveTextContent("0");

    // Message delivery stage cards
    expect(screen.getByTestId("metric-intended-recipients")).toHaveTextContent("1,500");
    expect(screen.getByTestId("metric-queued-messages")).toHaveTextContent("10");
    expect(screen.getByTestId("metric-accepted-messages")).toHaveTextContent("15");
    expect(screen.getByTestId("metric-sent-messages")).toHaveTextContent("20");
    expect(screen.getByTestId("metric-delivered-messages")).toHaveTextContent("1,100");
    expect(screen.getByTestId("metric-read-messages")).toHaveTextContent("320");
    expect(screen.getByTestId("metric-failed-messages")).toHaveTextContent("25");
    expect(screen.getByTestId("metric-pending-confirmation")).toHaveTextContent("45");
  });

  it("renders trends and charts tab with message volume and failure reasons breakdown", async () => {
    render(<AnalyticsPage />);

    // Switch to Trends & Charts tab
    const trendsTabBtn = screen.getByText("Trends & Charts");
    fireEvent.click(trendsTabBtn);

    await waitFor(() => {
      expect(screen.getByTestId("chart-message-volume")).toBeDefined();
      expect(screen.getByTestId("chart-rates-trend")).toBeDefined();
      expect(screen.getByTestId("chart-status-distribution")).toBeDefined();
      expect(screen.getByTestId("chart-failure-reasons")).toBeDefined();
    });

    // Sanitized failure diagnostic
    expect(screen.getByText("Code: 131026")).toBeDefined();
    expect(screen.getByText("Receiver phone number not registered on WhatsApp")).toBeDefined();
  });

  it("renders scheduling and honest restart-recovery telemetry tab", async () => {
    render(<AnalyticsPage />);

    // Switch to Scheduling & Recovery tab
    const schedTabBtn = screen.getByText("Scheduling & Recovery");
    fireEvent.click(schedTabBtn);

    await waitFor(() => {
      expect(screen.getByTestId("scheduling-panel")).toBeDefined();
    });

    expect(screen.getByText("Upcoming Festive Blast")).toBeDefined();
    expect(screen.getAllByText("Morning Broadcast").length).toBeGreaterThanOrEqual(1);

    // Restart-recovery honest disclosure
    const recoveryBox = screen.getByTestId("recovery-telemetry-box");
    expect(recoveryBox).toHaveTextContent("Backend Restart-Recovery Telemetry: Status Unavailable");
    expect(recoveryBox).toHaveTextContent("not persisted as database event records");
    expect(recoveryBox).toHaveTextContent("CREATE TABLE system_recovery_logs");
  });

  it("renders recipient-level delivery report with masked phone numbers and privacy shield", async () => {
    render(<AnalyticsPage />);

    // Switch to Delivery Report tab
    const messagesTabBtn = screen.getByText("Delivery Report");
    fireEvent.click(messagesTabBtn);

    await waitFor(() => {
      expect(screen.getByTestId("delivery-report-section")).toBeDefined();
    });

    // Masked phone numbers
    expect(screen.getByText("+9198••••••10")).toBeDefined();
    expect(screen.getByText("+9191••••••99")).toBeDefined();

    // Privacy shield notice
    expect(screen.getByText(/Recipient phone numbers are masked by default/i)).toBeDefined();

    // Diagnostic on failed message
    expect(screen.getByText(/Receiver phone number not registered on WhatsApp/i)).toBeDefined();
  });

  it("handles empty analytics response gracefully with zero division safeguard", async () => {
    vi.spyOn(apiClient, "getAnalyticsOverview").mockResolvedValue({
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        dateRange: {
          startDate: "2026-10-01T00:00:00.000Z",
          endDate: "2026-10-17T23:59:59.999Z",
          timeRange: "30d",
        },
        summary: {
          totalCampaigns: 0,
          draftCampaigns: 0,
          scheduledCampaigns: 0,
          queuedCampaigns: 0,
          sendingCampaigns: 0,
          completedCampaigns: 0,
          completedWithIssuesCampaigns: 0,
          failedCampaigns: 0,
          cancelledCampaigns: 0,
          totalIntendedRecipients: 0,
          queuedMessages: 0,
          acceptedMessages: 0,
          sentMessages: 0,
          deliveredMessages: 0,
          readMessages: 0,
          failedMessages: 0,
          deliveryConfirmationPendingMessages: 0,
          totalMessages: 0,
        },
        rates: {
          deliveryRate: {
            rate: 0,
            numerator: 0,
            denominator: 0,
            definition: "Delivery rate",
            formula: "(delivered + read) / total",
          },
          readRate: {
            rate: 0,
            numerator: 0,
            denominator: 0,
            definition: "Read rate",
            formula: "read / delivered",
          },
          failureRate: {
            rate: 0,
            numerator: 0,
            denominator: 0,
            definition: "Failure rate",
            formula: "failed / attempted",
          },
        },
        trends: {
          campaignVolumeOverTime: [],
          messageVolumeOverTime: [],
          ratesOverTime: [],
          campaignStatusDistribution: [],
          failureReasonsDistribution: [],
        },
        scheduling: {
          upcomingCount: 0,
          overdueCount: 0,
          dispatchedLateCount: 0,
          cancelledExpiredCount: 0,
          upcomingCampaigns: [],
          overdueCampaigns: [],
          dispatchedLateCampaigns: [],
          comparisons: [],
          restartRecovery: {
            isAvailable: false,
            historicalCount: null,
            status: "UNAVAILABLE",
            reason: "Not persisted",
            additiveDesignProposal: "CREATE TABLE ...",
          },
        },
      },
    });

    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("delivery-rate-card")).toBeDefined();
    });

    // Shows 0.0% without NaN or error
    expect(screen.getAllByText("0.0%").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByTestId("metric-total-campaigns")).toHaveTextContent("0");
  });
});
