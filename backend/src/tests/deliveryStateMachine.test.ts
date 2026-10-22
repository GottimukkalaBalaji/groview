import { describe, it, expect } from "vitest";
import { MessageDeliveryStatus } from "@prisma/client";
import {
  evaluateDeliveryTransition,
  DeliveryTransitionInput,
} from "../services/deliveryStateMachine.js";

describe("Phase 5C — Delivery State Machine Table-Driven Tests", () => {
  interface TestCase {
    name: string;
    input: DeliveryTransitionInput;
    expectedStatus: MessageDeliveryStatus;
    expectedApplied: boolean;
    expectedReason: string;
    expectedSentAtBackfill?: boolean;
    expectedDeliveredAtBackfill?: boolean;
    expectedErrorCleared?: boolean;
  }

  const baseTime = new Date("2026-10-14T10:00:00.000Z");
  const timePlus1m = new Date("2026-10-14T10:01:00.000Z");
  const timePlus2m = new Date("2026-10-14T10:02:00.000Z");
  const timePlus3m = new Date("2026-10-14T10:03:00.000Z");

  const testCases: TestCase[] = [
    // 1. Standard Linear Progression
    {
      name: "SUBMITTED_UNCONFIRMED -> ACCEPTED",
      input: {
        currentStatus: MessageDeliveryStatus.SUBMITTED_UNCONFIRMED,
        eventStatus: "accepted",
        eventTimestamp: baseTime,
      },
      expectedStatus: MessageDeliveryStatus.ACCEPTED,
      expectedApplied: true,
      expectedReason: "PROMOTED_TO_ACCEPTED",
    },
    {
      name: "ACCEPTED -> SENT",
      input: {
        currentStatus: MessageDeliveryStatus.ACCEPTED,
        eventStatus: "sent",
        eventTimestamp: timePlus1m,
      },
      expectedStatus: MessageDeliveryStatus.SENT,
      expectedApplied: true,
      expectedReason: "ACCEPTED_TO_SENT",
    },
    {
      name: "SENT -> DELIVERED",
      input: {
        currentStatus: MessageDeliveryStatus.SENT,
        eventStatus: "delivered",
        eventTimestamp: timePlus2m,
      },
      expectedStatus: MessageDeliveryStatus.DELIVERED,
      expectedApplied: true,
      expectedReason: "SENT_TO_DELIVERED",
    },
    {
      name: "DELIVERED -> READ",
      input: {
        currentStatus: MessageDeliveryStatus.DELIVERED,
        eventStatus: "read",
        eventTimestamp: timePlus3m,
      },
      expectedStatus: MessageDeliveryStatus.READ,
      expectedApplied: true,
      expectedReason: "DELIVERED_TO_READ",
    },

    // 2. Direct Leaps (Skipping intermediate events)
    {
      name: "QUEUED -> DELIVERED (Direct Leap)",
      input: {
        currentStatus: MessageDeliveryStatus.QUEUED,
        eventStatus: "delivered",
        eventTimestamp: timePlus2m,
      },
      expectedStatus: MessageDeliveryStatus.DELIVERED,
      expectedApplied: true,
      expectedReason: "PROMOTED_TO_DELIVERED",
    },
    {
      name: "SENDING -> READ (Direct Leap)",
      input: {
        currentStatus: MessageDeliveryStatus.SENDING,
        eventStatus: "read",
        eventTimestamp: timePlus3m,
      },
      expectedStatus: MessageDeliveryStatus.READ,
      expectedApplied: true,
      expectedReason: "PROMOTED_TO_READ",
    },

    // 3. Out-of-Order Success Backfills
    {
      name: "DELIVERED receiving late SENT retains DELIVERED and backfills sentAt",
      input: {
        currentStatus: MessageDeliveryStatus.DELIVERED,
        eventStatus: "sent",
        eventTimestamp: timePlus1m,
        existingTimestamps: { sentAt: null, deliveredAt: timePlus2m },
      },
      expectedStatus: MessageDeliveryStatus.DELIVERED,
      expectedApplied: true,
      expectedReason: "BACKFILL_SENT_TIMESTAMP",
      expectedSentAtBackfill: true,
    },
    {
      name: "READ receiving late DELIVERED retains READ and backfills deliveredAt",
      input: {
        currentStatus: MessageDeliveryStatus.READ,
        eventStatus: "delivered",
        eventTimestamp: timePlus2m,
        existingTimestamps: { sentAt: timePlus1m, deliveredAt: null, readAt: timePlus3m },
      },
      expectedStatus: MessageDeliveryStatus.READ,
      expectedApplied: true,
      expectedReason: "BACKFILL_DELIVERED_TIMESTAMP",
      expectedDeliveredAtBackfill: true,
    },

    // 4. Stale Failure After Delivery Protection (Anti-Downgrade)
    {
      name: "DELIVERED receiving subsequent FAILED ignores failure and preserves DELIVERED",
      input: {
        currentStatus: MessageDeliveryStatus.DELIVERED,
        eventStatus: "failed",
        eventTimestamp: timePlus3m,
        existingTimestamps: { deliveredAt: timePlus2m },
      },
      expectedStatus: MessageDeliveryStatus.DELIVERED,
      expectedApplied: false,
      expectedReason: "IGNORED_CONTRADICTORY_STALE_FAILURE",
    },
    {
      name: "READ receiving subsequent FAILED ignores failure and preserves READ",
      input: {
        currentStatus: MessageDeliveryStatus.READ,
        eventStatus: "failed",
        eventTimestamp: timePlus3m,
        existingTimestamps: { readAt: timePlus2m },
      },
      expectedStatus: MessageDeliveryStatus.READ,
      expectedApplied: false,
      expectedReason: "IGNORED_CONTRADICTORY_STALE_FAILURE",
    },

    // 5. Downstream Delivery Failure from SENT
    {
      name: "SENT receiving FAILED transitions to FAILED (Carrier delivery rejection)",
      input: {
        currentStatus: MessageDeliveryStatus.SENT,
        eventStatus: "failed",
        eventTimestamp: timePlus2m,
        errorCode: "131026",
        errorMessage: "Receiver is incapable of receiving this message",
      },
      expectedStatus: MessageDeliveryStatus.FAILED,
      expectedApplied: true,
      expectedReason: "DOWNSTREAM_DELIVERY_FAILURE",
    },

    // 6. Transient Failure Superseded by Authoritative Delivery Evidence
    {
      name: "FAILED receiving subsequent DELIVERED recovers to DELIVERED and clears errors",
      input: {
        currentStatus: MessageDeliveryStatus.FAILED,
        eventStatus: "delivered",
        eventTimestamp: timePlus3m,
        existingTimestamps: { failedAt: timePlus1m },
        errorCode: "131026",
        errorMessage: "Temporary carrier error",
      },
      expectedStatus: MessageDeliveryStatus.DELIVERED,
      expectedApplied: true,
      expectedReason: "TRANSIENT_FAILURE_SUPERSEDED_BY_DELIVERY",
      expectedErrorCleared: true,
    },
    {
      name: "FAILED receiving subsequent READ recovers to READ and clears errors",
      input: {
        currentStatus: MessageDeliveryStatus.FAILED,
        eventStatus: "read",
        eventTimestamp: timePlus3m,
        existingTimestamps: { failedAt: timePlus1m },
      },
      expectedStatus: MessageDeliveryStatus.READ,
      expectedApplied: true,
      expectedReason: "TRANSIENT_FAILURE_SUPERSEDED_BY_READ",
      expectedErrorCleared: true,
    },

    // 7. Duplicate Events (Idempotency)
    {
      name: "SENT receiving duplicate SENT is an idempotent no-op",
      input: {
        currentStatus: MessageDeliveryStatus.SENT,
        eventStatus: "sent",
        eventTimestamp: timePlus1m,
        existingTimestamps: { sentAt: timePlus1m },
      },
      expectedStatus: MessageDeliveryStatus.SENT,
      expectedApplied: false,
      expectedReason: "DUPLICATE_EVENT",
    },
    {
      name: "DELIVERED receiving duplicate DELIVERED is an idempotent no-op",
      input: {
        currentStatus: MessageDeliveryStatus.DELIVERED,
        eventStatus: "delivered",
        eventTimestamp: timePlus2m,
        existingTimestamps: { deliveredAt: timePlus2m },
      },
      expectedStatus: MessageDeliveryStatus.DELIVERED,
      expectedApplied: false,
      expectedReason: "DUPLICATE_EVENT",
    },
    {
      name: "READ receiving duplicate READ is an idempotent no-op",
      input: {
        currentStatus: MessageDeliveryStatus.READ,
        eventStatus: "read",
        eventTimestamp: timePlus3m,
        existingTimestamps: { readAt: timePlus3m },
      },
      expectedStatus: MessageDeliveryStatus.READ,
      expectedApplied: false,
      expectedReason: "DUPLICATE_EVENT",
    },
  ];

  testCases.forEach((tc) => {
    it(tc.name, () => {
      const result = evaluateDeliveryTransition(tc.input);

      expect(result.nextStatus).toBe(tc.expectedStatus);
      expect(result.applied).toBe(tc.expectedApplied);
      expect(result.reason).toBe(tc.expectedReason);

      if (tc.expectedSentAtBackfill) {
        expect(result.sentAt).toEqual(tc.input.eventTimestamp);
      }
      if (tc.expectedDeliveredAtBackfill) {
        expect(result.deliveredAt).toEqual(tc.input.eventTimestamp);
      }
      if (tc.expectedErrorCleared) {
        expect(result.errorCode).toBeNull();
        expect(result.errorMessage).toBeNull();
        expect(result.isTerminalFailure).toBe(false);
      }
    });
  });
});
