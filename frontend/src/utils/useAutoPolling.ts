import { useEffect, useRef, useCallback } from "react";

export interface UseAutoPollingOptions {
  /**
   * Polling interval in milliseconds. Defaults to 5000 (5 seconds).
   */
  intervalMs?: number;
  /**
   * Whether polling is currently active (e.g. modal is open, or page is mounted).
   */
  enabled?: boolean;
  /**
   * Callback executed on each polling tick.
   * Return a Promise or void. Overlapping executions are guarded.
   */
  onPoll: () => Promise<void> | void;
  /**
   * Whether to execute an immediate poll when polling becomes enabled or visibility resumes.
   * Defaults to false because components usually perform their own initial load.
   */
  pollOnResume?: boolean;
}

/**
 * Custom React hook for robust, document-visibility-aware background polling.
 * - Polls at a fixed interval (default: 5000ms).
 * - Prevents overlapping/duplicate in-flight requests.
 * - Pauses polling when document.visibilityState is 'hidden'.
 * - Resumes polling when document becomes 'visible'.
 * - Cleans up timers and event listeners on unmount or disable.
 * - Catches errors without breaking future polling intervals.
 */
export function useAutoPolling({
  intervalMs = 5000,
  enabled = true,
  onPoll,
  pollOnResume = false,
}: UseAutoPollingOptions): { triggerNow: () => void } {
  const inFlightRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onPollRef = useRef(onPoll);
  onPollRef.current = onPoll;

  const executePoll = useCallback(async () => {
    if (inFlightRef.current) {
      return; // Prevent duplicate/overlapping requests
    }
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return; // Skip poll if document is hidden
    }

    inFlightRef.current = true;
    try {
      await onPollRef.current();
    } catch {
      // Swallowed here so future intervals continue even on temporary network glitch
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const triggerNow = useCallback(() => {
    if (enabled) {
      void executePoll();
    }
  }, [enabled, executePoll]);

  useEffect(() => {
    if (!enabled) {
      clearTimer();
      return;
    }

    const startTimer = () => {
      clearTimer();
      timerRef.current = setInterval(() => {
        void executePoll();
      }, intervalMs);
    };

    const handleVisibilityChange = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "visible") {
        if (pollOnResume) {
          void executePoll();
        }
        startTimer();
      } else {
        clearTimer();
      }
    };

    // Initial timer setup if currently visible
    if (typeof document === "undefined" || document.visibilityState === "visible") {
      startTimer();
    }

    if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      clearTimer();
      if (typeof document !== "undefined" && typeof document.removeEventListener === "function") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, [enabled, intervalMs, pollOnResume, executePoll, clearTimer]);

  return { triggerNow };
}
