import type { ObjectDetectorHit } from "./objectDetectorTypes";
import { normalizeCocoLabel } from "./productDetectionPolicy";
import { SHARP_OBJECT_LABELS } from "./visualModerationPolicy";

export const DEFAULT_SHARP_OBJECT_MIN_CONFIDENCE = 0.7;
export const DEFAULT_SHARP_OBJECT_REQUIRED_HITS = 3;
export const DEFAULT_SHARP_OBJECT_WINDOW_MS = 5_000;

export type SharpObjectEvidenceHit = {
  atMs: number;
  label: "knife" | "scissors";
  confidence: number;
  fingerprint: string;
};

export type SharpObjectEnforcementAction = "none" | "warning" | "terminate";

export type SharpObjectEnforcementResult = {
  action: SharpObjectEnforcementAction;
  evidenceCount: number;
  requiredHits: number;
  label: "knife" | "scissors" | null;
  confidence: number | null;
  hits: SharpObjectEvidenceHit[];
};

export type SharpObjectEnforcementConfig = {
  minConfidence: number;
  requiredHits: number;
  windowMs: number;
};

export function readSharpObjectEnforcementConfig(
  env: Record<string, string | undefined> = import.meta.env as Record<string, string | undefined>,
): SharpObjectEnforcementConfig {
  return {
    minConfidence: parseEnvNumber(
      env.VITE_SHARP_OBJECT_MIN_CONFIDENCE,
      DEFAULT_SHARP_OBJECT_MIN_CONFIDENCE,
    ),
    requiredHits: Math.max(
      1,
      Math.floor(
        parseEnvNumber(env.VITE_SHARP_OBJECT_REQUIRED_HITS, DEFAULT_SHARP_OBJECT_REQUIRED_HITS),
      ),
    ),
    windowMs: Math.max(
      1,
      Math.floor(parseEnvNumber(env.VITE_SHARP_OBJECT_WINDOW_MS, DEFAULT_SHARP_OBJECT_WINDOW_MS)),
    ),
  };
}

export function detectionFingerprint(
  hit: ObjectDetectorHit,
  snapshotUpdatedAt: number,
): string {
  return [
    snapshotUpdatedAt,
    normalizeCocoLabel(hit.label),
    hit.score.toFixed(4),
    hit.x.toFixed(1),
    hit.y.toFixed(1),
    hit.width.toFixed(1),
    hit.height.toFixed(1),
  ].join("|");
}

export function pruneSharpObjectEvidence(
  hits: SharpObjectEvidenceHit[],
  nowMs: number,
  windowMs: number,
): SharpObjectEvidenceHit[] {
  return hits.filter((hit) => nowMs - hit.atMs <= windowMs);
}

export function appendSharpObjectEvidence(
  previous: SharpObjectEvidenceHit[],
  detections: ObjectDetectorHit[],
  options: {
    nowMs: number;
    snapshotUpdatedAt: number;
    config: SharpObjectEnforcementConfig;
    seenFingerprints: Set<string>;
  },
): SharpObjectEvidenceHit[] {
  const { nowMs, snapshotUpdatedAt, config, seenFingerprints } = options;
  let next = pruneSharpObjectEvidence(previous, nowMs, config.windowMs);

  for (const detection of detections) {
    const label = normalizeCocoLabel(detection.label);
    if (!(SHARP_OBJECT_LABELS as readonly string[]).includes(label)) {
      continue;
    }
    if (detection.score < config.minConfidence) {
      continue;
    }
    const fingerprint = detectionFingerprint(detection, snapshotUpdatedAt);
    if (seenFingerprints.has(fingerprint)) {
      continue;
    }
    seenFingerprints.add(fingerprint);
    next = [
      ...next,
      {
        atMs: nowMs,
        label: label as "knife" | "scissors",
        confidence: detection.score,
        fingerprint,
      },
    ];
  }

  return pruneSharpObjectEvidence(next, nowMs, config.windowMs);
}

export function evaluateSharpObjectEnforcement(
  hits: SharpObjectEvidenceHit[],
  config: SharpObjectEnforcementConfig,
): SharpObjectEnforcementResult {
  const evidenceCount = hits.length;
  if (evidenceCount <= 0) {
    return {
      action: "none",
      evidenceCount: 0,
      requiredHits: config.requiredHits,
      label: null,
      confidence: null,
      hits,
    };
  }

  const strongest = [...hits].sort((left, right) => right.confidence - left.confidence)[0]!;
  if (evidenceCount >= config.requiredHits) {
    return {
      action: "terminate",
      evidenceCount,
      requiredHits: config.requiredHits,
      label: strongest.label,
      confidence: strongest.confidence,
      hits,
    };
  }

  return {
    action: "warning",
    evidenceCount,
    requiredHits: config.requiredHits,
    label: strongest.label,
    confidence: strongest.confidence,
    hits,
  };
}

function parseEnvNumber(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}
