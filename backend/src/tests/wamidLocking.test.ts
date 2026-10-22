import { describe, it, expect } from "vitest";
import { WAMID_LOCK_NAMESPACE } from "../services/webhook.service.js";
import { evaluateDeliveryTransition } from "../services/deliveryStateMachine.js";
import { MessageDeliveryStatus } from "@prisma/client";

describe("Phase 5C — WAMID Locking & Concurrency Invariants", () => {
  it("uses isolated dedicated namespace 42 for WAMID transaction-scoped advisory locks", () => {
    expect(WAMID_LOCK_NAMESPACE).toBe(42);
  });

  it("evaluates a batch of unlinked events in chronological order to reach final state", () => {
    // Simulate batch of 3 unlinked events that arrived while message was in SUBMITTED_UNCONFIRMED
    const events = [
      {
        status: "accepted" as const,
        timestamp: new Date("2026-10-14T10:00:00.000Z"),
      },
      {
        status: "sent" as const,
        timestamp: new Date("2026-10-14T10:01:00.000Z"),
      },
      {
        status: "delivered" as const,
        timestamp: new Date("2026-10-14T10:02:00.000Z"),
      },
    ];

    let currentStatus = MessageDeliveryStatus.SUBMITTED_UNCONFIRMED;
    let sentAt: Date | undefined;
    let deliveredAt: Date | undefined;

    for (const evt of events) {
      const res = evaluateDeliveryTransition({
        currentStatus,
        eventStatus: evt.status,
        eventTimestamp: evt.timestamp,
        existingTimestamps: { sentAt, deliveredAt },
      });

      if (res.applied) {
        currentStatus = res.nextStatus;
        if (res.sentAt && !sentAt) sentAt = res.sentAt;
        if (res.deliveredAt && !deliveredAt) deliveredAt = res.deliveredAt;
      }
    }

    expect(currentStatus).toBe(MessageDeliveryStatus.DELIVERED);
    expect(sentAt).toEqual(new Date("2026-10-14T10:01:00.000Z"));
    expect(deliveredAt).toEqual(new Date("2026-10-14T10:02:00.000Z"));
  });

  it("handles out-of-order arrival in batch without state regression", () => {
    // Out-of-order scenario: delivered arrived, followed by late sent callback
    const events = [
      {
        status: "delivered" as const,
        timestamp: new Date("2026-10-14T10:02:00.000Z"),
      },
      {
        status: "sent" as const,
        timestamp: new Date("2026-10-14T10:01:00.000Z"),
      },
    ];

    let currentStatus = MessageDeliveryStatus.ACCEPTED;
    let sentAt: Date | undefined;
    let deliveredAt: Date | undefined;

    for (const evt of events) {
      const res = evaluateDeliveryTransition({
        currentStatus,
        eventStatus: evt.status,
        eventTimestamp: evt.timestamp,
        existingTimestamps: { sentAt, deliveredAt },
      });

      if (res.applied) {
        currentStatus = res.nextStatus;
        if (res.sentAt && !sentAt) sentAt = res.sentAt;
        if (res.deliveredAt && !deliveredAt) deliveredAt = res.deliveredAt;
      }
    }

    // Status must remain DELIVERED, and sentAt is backfilled!
    expect(currentStatus).toBe(MessageDeliveryStatus.DELIVERED);
    expect(sentAt).toEqual(new Date("2026-10-14T10:01:00.000Z"));
    expect(deliveredAt).toEqual(new Date("2026-10-14T10:02:00.000Z"));
  });
});
