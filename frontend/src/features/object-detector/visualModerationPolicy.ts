import type { ObjectDetectorHit } from "./objectDetectorTypes";
import {
  DEFAULT_SCORE_THRESHOLD,
  DEMO_PRODUCT_LABELS,
  normalizeCocoLabel,
} from "./productDetectionPolicy";

/** COCO labels that can honestly support a sharp-object warning (not "weapon detection"). */
export const SHARP_OBJECT_LABELS = ["knife", "scissors"] as const;

export const DEFAULT_CROWD_PERSON_THRESHOLD = 4;
export const DEFAULT_PRODUCT_ABSENCE_GRACE_MS = 5_000;

export type VisualModerationFindingCode =
  | "sharp_object"
  | "crowd"
  | "product_absence";

export type VisualModerationFinding = {
  code: VisualModerationFindingCode;
  severity: "warning";
  matchedLabels: string[];
  personCount?: number;
  absenceMs?: number;
};

export type VisualModerationResult = {
  status: "safe" | "warning";
  findings: VisualModerationFinding[];
};

export type EvaluateVisualModerationInput = {
  detections: ObjectDetectorHit[];
  isActive: boolean;
  nowMs: number;
  lastProductSeenAtMs: number | null;
  cameraActiveSinceMs: number | null;
  scoreThreshold?: number;
  crowdPersonThreshold?: number;
  productAbsenceGraceMs?: number;
  productAllowlist?: readonly string[];
  sharpLabels?: readonly string[];
};

/**
 * Pure COCO-label moderation rules.
 *
 * Honest scope: sharp-object / crowd / product-presence warnings only.
 * Not violence, assault, weapon, or unsafe-behavior detection.
 */
export function evaluateVisualModeration(
  input: EvaluateVisualModerationInput,
): VisualModerationResult {
  if (!input.isActive) {
    return { status: "safe", findings: [] };
  }

  const scoreThreshold = input.scoreThreshold ?? DEFAULT_SCORE_THRESHOLD;
  const crowdThreshold = input.crowdPersonThreshold ?? DEFAULT_CROWD_PERSON_THRESHOLD;
  const absenceGraceMs = input.productAbsenceGraceMs ?? DEFAULT_PRODUCT_ABSENCE_GRACE_MS;
  const productAllowlist = input.productAllowlist ?? DEMO_PRODUCT_LABELS;
  const sharpLabels = input.sharpLabels ?? SHARP_OBJECT_LABELS;

  const scored = input.detections.filter((hit) => hit.score >= scoreThreshold);
  const findings: VisualModerationFinding[] = [];

  const sharpMatched = uniqueLabels(
    scored
      .filter((hit) => (sharpLabels as readonly string[]).includes(normalizeCocoLabel(hit.label)))
      .map((hit) => normalizeCocoLabel(hit.label)),
  );
  if (sharpMatched.length > 0) {
    findings.push({
      code: "sharp_object",
      severity: "warning",
      matchedLabels: sharpMatched,
    });
  }

  const personCount = scored.filter(
    (hit) => normalizeCocoLabel(hit.label) === "person",
  ).length;
  if (personCount >= crowdThreshold) {
    findings.push({
      code: "crowd",
      severity: "warning",
      matchedLabels: ["person"],
      personCount,
    });
  }

  const hasProduct = scored.some((hit) =>
    productAllowlist.includes(normalizeCocoLabel(hit.label)),
  );

  const activeSince = input.cameraActiveSinceMs;
  if (activeSince !== null) {
    const activeForMs = Math.max(0, input.nowMs - activeSince);
    const lastProductAt = hasProduct ? input.nowMs : input.lastProductSeenAtMs;
    const missingForMs =
      lastProductAt === null
        ? activeForMs
        : Math.max(0, input.nowMs - lastProductAt);

    if (activeForMs >= absenceGraceMs && missingForMs >= absenceGraceMs && !hasProduct) {
      findings.push({
        code: "product_absence",
        severity: "warning",
        matchedLabels: [],
        absenceMs: missingForMs,
      });
    }
  }

  return {
    status: findings.length > 0 ? "warning" : "safe",
    findings,
  };
}

export function nextLastProductSeenAtMs(options: {
  detections: ObjectDetectorHit[];
  nowMs: number;
  previousMs: number | null;
  scoreThreshold?: number;
  productAllowlist?: readonly string[];
}): number | null {
  const scoreThreshold = options.scoreThreshold ?? DEFAULT_SCORE_THRESHOLD;
  const productAllowlist = options.productAllowlist ?? DEMO_PRODUCT_LABELS;
  const seen = options.detections.some((hit) => {
    if (hit.score < scoreThreshold) {
      return false;
    }
    const label = normalizeCocoLabel(hit.label);
    return productAllowlist.includes(label);
  });
  if (seen) {
    return options.nowMs;
  }
  return options.previousMs;
}

export function filterScoredDetections(
  hits: ObjectDetectorHit[],
  options?: {
    scoreThreshold?: number;
    maxDetections?: number;
  },
): ObjectDetectorHit[] {
  const scoreThreshold = options?.scoreThreshold ?? DEFAULT_SCORE_THRESHOLD;
  const maxDetections = options?.maxDetections ?? 10;
  return hits
    .filter((hit) => hit.score >= scoreThreshold)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(0, maxDetections));
}

function uniqueLabels(labels: string[]): string[] {
  return [...new Set(labels)];
}
