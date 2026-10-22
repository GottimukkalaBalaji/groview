import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MessageDeliveryStatus } from "@prisma/client";
import { env } from "../config/env.js";
import {
  startWorkerIfEnabled,
  stopWorker,
  getDispatchWorker,
} from "../services/automaticWorker.service.js";
import { processDispatchMessage } from "../workers/dispatch.worker.js";
import { getPrismaClient } from "../config/prisma.js";
import { CampaignLifecycleService } from "../services/campaignLifecycle.service.js";
import * as redisModule from "../config/redis.js";
import * as dispatchWorkerModule from "../workers/dispatch.worker.js";

describe("Stage B — Automatic Worker Integration & Safety Tests", () => {
  beforeEach(async () => {
    await stopWorker();
    vi.restoreAllMocks();
    vi.spyOn(CampaignLifecycleService, "markCampaignSendingIfClaimed").mockResolvedValue(true as any);
    vi.spyOn(CampaignLifecycleService, "evaluateCampaignLifecycle").mockResolvedValue(undefined as any);
  });

  afterEach(async () => {
    await stopWorker();
    vi.restoreAllMocks();
  });

  describe("1. Worker Startup Configuration & Kill Switch", () => {
    it("keeps worker disabled by default when ENABLE_AUTOMATIC_WORKER is false", () => {
      // Default state
      (env as any).ENABLE_AUTOMATIC_WORKER = false;

      const worker = startWorkerIfEnabled();
      expect(worker).toBeNull();
      expect(getDispatchWorker()).toBeNull();
    });

    it("does not start worker when ENABLE_AUTOMATIC_WORKER is true but Redis is not configured", () => {
      (env as any).ENABLE_AUTOMATIC_WORKER = true;
      vi.spyOn(redisModule, "isRedisConfigured").mockReturnValue(false);

      const worker = startWorkerIfEnabled();
      expect(worker).toBeNull();
      expect(getDispatchWorker()).toBeNull();
    });

    it("initializes exactly one worker instance when ENABLE_AUTOMATIC_WORKER is true and Redis is configured", async () => {
      (env as any).ENABLE_AUTOMATIC_WORKER = true;
      vi.spyOn(redisModule, "isRedisConfigured").mockReturnValue(true);

      const mockWorkerInstance = {
        close: vi.fn().mockResolvedValue(undefined),
      } as any;

      const createSpy = vi
        .spyOn(dispatchWorkerModule, "createDispatchWorker")
        .mockReturnValue(mockWorkerInstance);

      const worker1 = startWorkerIfEnabled();
      expect(worker1).toBe(mockWorkerInstance);
      expect(getDispatchWorker()).toBe(mockWorkerInstance);
      expect(createSpy).toHaveBeenCalledTimes(1);

      // Subsequent call enforces single-instance singleton without spawning another worker
      const worker2 = startWorkerIfEnabled();
      expect(worker2).toBe(mockWorkerInstance);
      expect(createSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("2. Graceful Shutdown Lifecycle", () => {
    it("cleanly closes the worker instance and resets worker reference to null", async () => {
      (env as any).ENABLE_AUTOMATIC_WORKER = true;
      vi.spyOn(redisModule, "isRedisConfigured").mockReturnValue(true);

      const mockClose = vi.fn().mockResolvedValue(undefined);
      const mockWorkerInstance = { close: mockClose } as any;

      vi.spyOn(dispatchWorkerModule, "createDispatchWorker").mockReturnValue(mockWorkerInstance);

      startWorkerIfEnabled();
      expect(getDispatchWorker()).toBe(mockWorkerInstance);

      await stopWorker();
      expect(mockClose).toHaveBeenCalledTimes(1);
      expect(getDispatchWorker()).toBeNull();
    });
  });

  describe("3. Atomic Claims & Safety Guards in Dispatch Handler", () => {
    it("safely skips already-terminal or non-QUEUED messages without resending", async () => {
      const prisma = getPrismaClient();

      // Mock $queryRaw returning 0 rows (message already ACCEPTED/SENT, not claimable)
      vi.spyOn(prisma, "$queryRaw").mockResolvedValueOnce([]);

      const result = await processDispatchMessage({
        messageId: "msg_already_accepted_123",
        organizationId: "org_test",
        campaignId: "cmp_test",
      });

      expect(result.success).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe("NOT_CLAIMABLE");
    });

    it("safely skips synthetic jobs whose message ID does not exist in PostgreSQL", async () => {
      const prisma = getPrismaClient();

      // Mock $queryRaw returning 0 rows (no row exists for synthetic ID)
      vi.spyOn(prisma, "$queryRaw").mockResolvedValueOnce([]);

      const result = await processDispatchMessage({
        messageId: "msg_synthetic_fixture_999",
        organizationId: "org_default",
        campaignId: "cmp_non_existent",
      });

      expect(result.success).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe("NOT_CLAIMABLE");
    });

    it("fences stale SENDING message to SUBMITTED_UNCONFIRMED to prevent blind duplicate sends", async () => {
      const prisma = getPrismaClient();

      // Mock $queryRaw claiming a row that transitioned to SUBMITTED_UNCONFIRMED (stale SENDING recovery)
      vi.spyOn(prisma, "$queryRaw").mockResolvedValueOnce([
        {
          id: "msg_stale_sending_456",
          status: MessageDeliveryStatus.SUBMITTED_UNCONFIRMED,
          wamid: null,
          recipientPhone: "+15551234567",
          templateName: "hello_world",
          templateLanguage: "en_US",
          parameters: {},
          attemptCount: 2,
        },
      ]);

      const result = await processDispatchMessage({
        messageId: "msg_stale_sending_456",
        organizationId: "org_test",
        campaignId: "cmp_test",
      });

      expect(result.success).toBe(false);
      expect(result.fenced).toBe(true);
      expect(result.status).toBe(MessageDeliveryStatus.SUBMITTED_UNCONFIRMED);
      expect(result.reason).toBe("FENCED_AGAINST_DUPLICATE_SEND");
    });
  });
});
