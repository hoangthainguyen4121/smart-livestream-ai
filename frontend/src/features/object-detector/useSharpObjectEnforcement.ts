import { useEffect, useMemo, useRef, useState } from "react";

import type { ObjectDetectorHit } from "./objectDetectorTypes";
import {
  appendSharpObjectEvidence,
  evaluateSharpObjectEnforcement,
  pruneSharpObjectEvidence,
  readSharpObjectEnforcementConfig,
  type SharpObjectEnforcementResult,
  type SharpObjectEvidenceHit,
} from "./sharpObjectEnforcementPolicy";

type UseSharpObjectEnforcementOptions = {
  enabled: boolean;
  isActive: boolean;
  detections: ObjectDetectorHit[];
  snapshotUpdatedAt: number;
  sessionId: string | null;
  terminated: boolean;
  /**
   * CV test harness: accumulate evidence + fire onTerminate without a real
   * live session. Caller must NOT call backend end-session.
   */
  simulateModeration?: boolean;
  /** Bump to clear temporal evidence (seek / video change on CV test page). */
  resetEpoch?: number;
  onTerminate: (payload: {
    label: "knife" | "scissors";
    confidence: number;
    evidenceCount: number;
    windowMs: number;
  }) => void;
};

export function useSharpObjectEnforcement(options: UseSharpObjectEnforcementOptions) {
  const config = useMemo(() => readSharpObjectEnforcementConfig(), []);
  const [hits, setHits] = useState<SharpObjectEvidenceHit[]>([]);
  const hitsRef = useRef<SharpObjectEvidenceHit[]>([]);
  const seenFingerprintsRef = useRef(new Set<string>());
  const terminateRequestedRef = useRef(false);
  const onTerminateRef = useRef(options.onTerminate);
  onTerminateRef.current = options.onTerminate;
  hitsRef.current = hits;

  useEffect(() => {
    if (!options.enabled || !options.isActive || options.terminated) {
      hitsRef.current = [];
      setHits([]);
      seenFingerprintsRef.current = new Set();
      if (!options.terminated) {
        terminateRequestedRef.current = false;
      }
    }
  }, [options.enabled, options.isActive, options.terminated]);

  useEffect(() => {
    if (options.resetEpoch === undefined) {
      return;
    }
    hitsRef.current = [];
    setHits([]);
    seenFingerprintsRef.current = new Set();
    terminateRequestedRef.current = false;
  }, [options.resetEpoch]);

  useEffect(() => {
    const sessionOk = Boolean(options.sessionId) || Boolean(options.simulateModeration);
    if (
      !options.enabled ||
      !options.isActive ||
      options.terminated ||
      !sessionOk ||
      terminateRequestedRef.current
    ) {
      return;
    }

    const nowMs = Date.now();
    const next = appendSharpObjectEvidence(hitsRef.current, options.detections, {
      nowMs,
      snapshotUpdatedAt: options.snapshotUpdatedAt,
      config,
      seenFingerprints: seenFingerprintsRef.current,
    });
    hitsRef.current = next;
    setHits(next);

    const decision = evaluateSharpObjectEnforcement(next, config);
    if (decision.action === "terminate" && decision.label && decision.confidence !== null) {
      terminateRequestedRef.current = true;
      onTerminateRef.current({
        label: decision.label,
        confidence: decision.confidence,
        evidenceCount: decision.evidenceCount,
        windowMs: config.windowMs,
      });
    }
  }, [
    options.enabled,
    options.isActive,
    options.terminated,
    options.sessionId,
    options.simulateModeration,
    options.detections,
    options.snapshotUpdatedAt,
    config,
  ]);

  useEffect(() => {
    if (!options.enabled || !options.isActive || options.terminated) {
      return undefined;
    }
    const intervalId = window.setInterval(() => {
      const pruned = pruneSharpObjectEvidence(hitsRef.current, Date.now(), config.windowMs);
      hitsRef.current = pruned;
      setHits(pruned);
    }, 500);
    return () => window.clearInterval(intervalId);
  }, [options.enabled, options.isActive, options.terminated, config.windowMs]);

  const result: SharpObjectEnforcementResult = useMemo(
    () => evaluateSharpObjectEnforcement(hits, config),
    [hits, config],
  );

  return {
    config,
    result,
  };
}
