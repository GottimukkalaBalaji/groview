import { MessageDeliveryStatus } from "@prisma/client";

export interface DeliveryTransitionInput {
  currentStatus: MessageDeliveryStatus;
  eventStatus: "accepted" | "sent" | "delivered" | "read" | "failed";
  eventTimestamp: Date;
  existingTimestamps?: {
    sentAt?: Date | null;
    deliveredAt?: Date | null;
    readAt?: Date | null;
    failedAt?: Date | null;
  };
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface DeliveryTransitionResult {
  nextStatus: MessageDeliveryStatus;
  applied: boolean;
  reason: string;
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
  failedAt?: Date;
  errorCode?: string | null;
  errorMessage?: string | null;
  isTerminalFailure?: boolean;
}

/**
 * Pure, table-driven state machine evaluation for WhatsApp delivery events.
 * Guarantees monotonic progression towards authoritative delivery and read states,
 * defends against stale out-of-order events, and handles transient failures followed by delivery.
 */
export function evaluateDeliveryTransition(
  input: DeliveryTransitionInput
): DeliveryTransitionResult {
  const { currentStatus, eventStatus, eventTimestamp, existingTimestamps = {} } = input;

  // 1. Terminal / Authoritative Delivered & Read Protection
  if (currentStatus === MessageDeliveryStatus.READ) {
    if (eventStatus === "read") {
      return {
        nextStatus: MessageDeliveryStatus.READ,
        applied: false,
        reason: "DUPLICATE_EVENT",
      };
    }
    if (eventStatus === "failed") {
      return {
        nextStatus: MessageDeliveryStatus.READ,
        applied: false,
        reason: "IGNORED_CONTRADICTORY_STALE_FAILURE",
      };
    }
    if (eventStatus === "delivered" && (!existingTimestamps.deliveredAt || eventTimestamp < existingTimestamps.deliveredAt)) {
      return {
        nextStatus: MessageDeliveryStatus.READ,
        applied: true,
        reason: "BACKFILL_DELIVERED_TIMESTAMP",
        deliveredAt: eventTimestamp,
      };
    }
    if (eventStatus === "sent" && (!existingTimestamps.sentAt || eventTimestamp < existingTimestamps.sentAt)) {
      return {
        nextStatus: MessageDeliveryStatus.READ,
        applied: true,
        reason: "BACKFILL_SENT_TIMESTAMP",
        sentAt: eventTimestamp,
      };
    }
    return {
      nextStatus: MessageDeliveryStatus.READ,
      applied: false,
      reason: "STALE_EVENT_IGNORED",
    };
  }

  if (currentStatus === MessageDeliveryStatus.DELIVERED) {
    if (eventStatus === "delivered") {
      return {
        nextStatus: MessageDeliveryStatus.DELIVERED,
        applied: false,
        reason: "DUPLICATE_EVENT",
      };
    }
    if (eventStatus === "read") {
      return {
        nextStatus: MessageDeliveryStatus.READ,
        applied: true,
        reason: "DELIVERED_TO_READ",
        readAt: eventTimestamp,
      };
    }
    if (eventStatus === "failed") {
      return {
        nextStatus: MessageDeliveryStatus.DELIVERED,
        applied: false,
        reason: "IGNORED_CONTRADICTORY_STALE_FAILURE",
      };
    }
    if (eventStatus === "sent" && (!existingTimestamps.sentAt || eventTimestamp < existingTimestamps.sentAt)) {
      return {
        nextStatus: MessageDeliveryStatus.DELIVERED,
        applied: true,
        reason: "BACKFILL_SENT_TIMESTAMP",
        sentAt: eventTimestamp,
      };
    }
    return {
      nextStatus: MessageDeliveryStatus.DELIVERED,
      applied: false,
      reason: "STALE_EVENT_IGNORED",
    };
  }

  // 2. Handling Messages in FAILED status
  if (currentStatus === MessageDeliveryStatus.FAILED) {
    if (eventStatus === "failed") {
      return {
        nextStatus: MessageDeliveryStatus.FAILED,
        applied: false,
        reason: "DUPLICATE_EVENT",
      };
    }
    // Transient failure superseded by authoritative delivery proof
    if (eventStatus === "delivered") {
      return {
        nextStatus: MessageDeliveryStatus.DELIVERED,
        applied: true,
        reason: "TRANSIENT_FAILURE_SUPERSEDED_BY_DELIVERY",
        deliveredAt: eventTimestamp,
        sentAt: existingTimestamps.sentAt ?? eventTimestamp,
        errorCode: null,
        errorMessage: null,
        isTerminalFailure: false,
      };
    }
    if (eventStatus === "read") {
      return {
        nextStatus: MessageDeliveryStatus.READ,
        applied: true,
        reason: "TRANSIENT_FAILURE_SUPERSEDED_BY_READ",
        readAt: eventTimestamp,
        deliveredAt: existingTimestamps.deliveredAt ?? eventTimestamp,
        sentAt: existingTimestamps.sentAt ?? eventTimestamp,
        errorCode: null,
        errorMessage: null,
        isTerminalFailure: false,
      };
    }
    // Stale sent/accepted after failure is ignored
    return {
      nextStatus: MessageDeliveryStatus.FAILED,
      applied: false,
      reason: "STALE_EVENT_IGNORED",
    };
  }

  // 3. Handling Messages in SENT status
  if (currentStatus === MessageDeliveryStatus.SENT) {
    if (eventStatus === "sent") {
      return {
        nextStatus: MessageDeliveryStatus.SENT,
        applied: false,
        reason: "DUPLICATE_EVENT",
      };
    }
    if (eventStatus === "delivered") {
      return {
        nextStatus: MessageDeliveryStatus.DELIVERED,
        applied: true,
        reason: "SENT_TO_DELIVERED",
        deliveredAt: eventTimestamp,
      };
    }
    if (eventStatus === "read") {
      return {
        nextStatus: MessageDeliveryStatus.READ,
        applied: true,
        reason: "SENT_TO_READ",
        readAt: eventTimestamp,
        deliveredAt: existingTimestamps.deliveredAt ?? eventTimestamp,
      };
    }
    if (eventStatus === "failed") {
      return {
        nextStatus: MessageDeliveryStatus.FAILED,
        applied: true,
        reason: "DOWNSTREAM_DELIVERY_FAILURE",
        failedAt: eventTimestamp,
        errorCode: input.errorCode ?? "DELIVERY_FAILED",
        errorMessage: input.errorMessage ?? "Carrier reported delivery failure",
        isTerminalFailure: true,
      };
    }
    return {
      nextStatus: MessageDeliveryStatus.SENT,
      applied: false,
      reason: "STALE_EVENT_IGNORED",
    };
  }

  // 4. Handling Messages in ACCEPTED status
  if (currentStatus === MessageDeliveryStatus.ACCEPTED) {
    if (eventStatus === "accepted") {
      return {
        nextStatus: MessageDeliveryStatus.ACCEPTED,
        applied: false,
        reason: "DUPLICATE_EVENT",
      };
    }
    if (eventStatus === "sent") {
      return {
        nextStatus: MessageDeliveryStatus.SENT,
        applied: true,
        reason: "ACCEPTED_TO_SENT",
        sentAt: eventTimestamp,
      };
    }
    if (eventStatus === "delivered") {
      return {
        nextStatus: MessageDeliveryStatus.DELIVERED,
        applied: true,
        reason: "ACCEPTED_TO_DELIVERED",
        deliveredAt: eventTimestamp,
        sentAt: existingTimestamps.sentAt || undefined,
      };
    }
    if (eventStatus === "read") {
      return {
        nextStatus: MessageDeliveryStatus.READ,
        applied: true,
        reason: "ACCEPTED_TO_READ",
        readAt: eventTimestamp,
        deliveredAt: existingTimestamps.deliveredAt || undefined,
        sentAt: existingTimestamps.sentAt || undefined,
      };
    }
    if (eventStatus === "failed") {
      return {
        nextStatus: MessageDeliveryStatus.FAILED,
        applied: true,
        reason: "ACCEPTED_TO_FAILED",
        failedAt: eventTimestamp,
        errorCode: input.errorCode ?? "FAILED_AFTER_ACCEPT",
        errorMessage: input.errorMessage ?? "Meta failed message after initial acceptance",
        isTerminalFailure: true,
      };
    }
  }

  // 5. Handling Initial States: QUEUED, SENDING, SUBMITTED_UNCONFIRMED
  switch (eventStatus) {
    case "accepted":
      return {
        nextStatus: MessageDeliveryStatus.ACCEPTED,
        applied: true,
        reason: "PROMOTED_TO_ACCEPTED",
      };
    case "sent":
      return {
        nextStatus: MessageDeliveryStatus.SENT,
        applied: true,
        reason: "PROMOTED_TO_SENT",
        sentAt: eventTimestamp,
      };
    case "delivered":
      return {
        nextStatus: MessageDeliveryStatus.DELIVERED,
        applied: true,
        reason: "PROMOTED_TO_DELIVERED",
        deliveredAt: eventTimestamp,
        sentAt: existingTimestamps.sentAt || undefined,
      };
    case "read":
      return {
        nextStatus: MessageDeliveryStatus.READ,
        applied: true,
        reason: "PROMOTED_TO_READ",
        readAt: eventTimestamp,
        deliveredAt: existingTimestamps.deliveredAt || undefined,
        sentAt: existingTimestamps.sentAt || undefined,
      };
    case "failed":
      return {
        nextStatus: MessageDeliveryStatus.FAILED,
        applied: true,
        reason: "INITIAL_DISPATCH_FAILURE",
        failedAt: eventTimestamp,
        errorCode: input.errorCode ?? "DISPATCH_FAILED",
        errorMessage: input.errorMessage ?? "Meta reported dispatch failure",
        isTerminalFailure: true,
      };
  }
}
