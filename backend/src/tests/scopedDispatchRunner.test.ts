import { describe, it, expect } from "vitest";
import {
  SCOPED_ALLOWED_MESSAGE_IDS,
  runScopedDispatch,
} from "../workers/scopedDispatchRunner.js";

describe("Phase 10 — Scoped Dispatch Runner Unit Tests", () => {
  it("enforces strict immutable allowlist of exactly two approved message IDs", () => {
    expect(SCOPED_ALLOWED_MESSAGE_IDS).toHaveLength(2);
    expect(SCOPED_ALLOWED_MESSAGE_IDS).toContain("cmvaxvma10005t86wymevr2li");
    expect(SCOPED_ALLOWED_MESSAGE_IDS).toContain("cmvaxvna00007t86w594ddrst");
    expect(Object.isFrozen(SCOPED_ALLOWED_MESSAGE_IDS)).toBe(true);
  });

  it("fails closed with an immediate security violation error if any unauthorized message ID is targeted", async () => {
    const unauthorizedId = "unauthorized_msg_999";
    await expect(runScopedDispatch([unauthorizedId])).rejects.toThrow(
      /SECURITY_VIOLATION.*not in the authorized allowlist/i
    );
  });

  it("fails closed if a mix of authorized and unauthorized message IDs is attempted", async () => {
    await expect(
      runScopedDispatch(["cmvaxvma10005t86wymevr2li", "evil_msg_id"])
    ).rejects.toThrow(/SECURITY_VIOLATION/i);
  });
});
