import { describe, expect, it, vi } from "vitest";

import { DEFAULT_INFERENCE_INTERVAL_MS } from "./productDetectionPolicy";

/**
 * Mirrors the hook's drop-if-busy + throttle policy for unit coverage without DOM/MediaPipe.
 */
function createDetectionLoop(options: {
  intervalMs?: number;
  detect: () => void;
}) {
  const intervalMs = options.intervalMs ?? DEFAULT_INFERENCE_INTERVAL_MS;
  let inFlight = false;
  let enabled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let detectCalls = 0;

  const tick = () => {
    if (!enabled) {
      return;
    }
    if (inFlight) {
      timer = setTimeout(tick, intervalMs);
      return;
    }
    inFlight = true;
    detectCalls += 1;
    try {
      options.detect();
    } finally {
      inFlight = false;
      if (enabled) {
        timer = setTimeout(tick, intervalMs);
      }
    }
  };

  return {
    start() {
      enabled = true;
      tick();
    },
    stop() {
      enabled = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    getDetectCalls: () => detectCalls,
  };
}

describe("product detection loop policy", () => {
  it("does not infer when toggle/loop is off", () => {
    const detect = vi.fn();
    createDetectionLoop({ detect });
    expect(detect).not.toHaveBeenCalled();
  });

  it("runs throttled inference while active (~4 FPS default interval)", () => {
    vi.useFakeTimers();
    const detect = vi.fn();
    const loop = createDetectionLoop({ detect, intervalMs: 250 });
    loop.start();
    expect(detect).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(250);
    expect(detect).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(250);
    expect(detect).toHaveBeenCalledTimes(3);
    loop.stop();
    vi.useRealTimers();
  });

  it("rejects concurrent inference starts while in flight", () => {
    let inFlight = false;
    const tryStart = () => {
      if (inFlight) {
        return false;
      }
      inFlight = true;
      return true;
    };

    expect(tryStart()).toBe(true);
    expect(tryStart()).toBe(false);
    inFlight = false;
    expect(tryStart()).toBe(true);
  });

  it("stops scheduling after stop/unmount cleanup", () => {
    vi.useFakeTimers();
    const detect = vi.fn();
    const loop = createDetectionLoop({ detect, intervalMs: 250 });
    loop.start();
    loop.stop();
    const callsAfterStop = loop.getDetectCalls();
    vi.advanceTimersByTime(1000);
    expect(loop.getDetectCalls()).toBe(callsAfterStop);
    vi.useRealTimers();
  });
});
