import { useEffect, useMemo, useRef, useState } from "react";

import type { ObjectDetectorHit } from "./objectDetectorTypes";
import {
  DEFAULT_PRODUCT_ABSENCE_GRACE_MS,
  evaluateVisualModeration,
  nextLastProductSeenAtMs,
  type VisualModerationResult,
} from "./visualModerationPolicy";

type UseVisualModerationOptions = {
  enabled: boolean;
  isActive: boolean;
  detections: ObjectDetectorHit[];
  productAbsenceGraceMs?: number;
};

const EMPTY_RESULT: VisualModerationResult = { status: "safe", findings: [] };

export function useVisualModeration(options: UseVisualModerationOptions): VisualModerationResult {
  const graceMs = options.productAbsenceGraceMs ?? DEFAULT_PRODUCT_ABSENCE_GRACE_MS;
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [lastProductSeenAtMs, setLastProductSeenAtMs] = useState<number | null>(null);
  const [cameraActiveSinceMs, setCameraActiveSinceMs] = useState<number | null>(null);
  const detectionsRef = useRef(options.detections);
  detectionsRef.current = options.detections;

  useEffect(() => {
    if (!options.enabled || !options.isActive) {
      setLastProductSeenAtMs(null);
      setCameraActiveSinceMs(null);
      return undefined;
    }

    const startedAt = Date.now();
    setCameraActiveSinceMs(startedAt);
    setLastProductSeenAtMs(
      nextLastProductSeenAtMs({
        detections: detectionsRef.current,
        nowMs: startedAt,
        previousMs: null,
      }),
    );

    const intervalId = window.setInterval(() => {
      const now = Date.now();
      setNowMs(now);
      setLastProductSeenAtMs((previous) =>
        nextLastProductSeenAtMs({
          detections: detectionsRef.current,
          nowMs: now,
          previousMs: previous,
        }),
      );
    }, 500);

    return () => {
      window.clearInterval(intervalId);
      setLastProductSeenAtMs(null);
      setCameraActiveSinceMs(null);
    };
  }, [options.enabled, options.isActive]);

  useEffect(() => {
    if (!options.enabled || !options.isActive) {
      return;
    }
    const now = Date.now();
    setNowMs(now);
    setLastProductSeenAtMs((previous) =>
      nextLastProductSeenAtMs({
        detections: options.detections,
        nowMs: now,
        previousMs: previous,
      }),
    );
  }, [options.detections, options.enabled, options.isActive]);

  return useMemo(() => {
    if (!options.enabled) {
      return EMPTY_RESULT;
    }
    return evaluateVisualModeration({
      detections: options.detections,
      isActive: options.isActive,
      nowMs,
      lastProductSeenAtMs,
      cameraActiveSinceMs,
      productAbsenceGraceMs: graceMs,
    });
  }, [
    options.enabled,
    options.isActive,
    options.detections,
    nowMs,
    lastProductSeenAtMs,
    cameraActiveSinceMs,
    graceMs,
  ]);
}
