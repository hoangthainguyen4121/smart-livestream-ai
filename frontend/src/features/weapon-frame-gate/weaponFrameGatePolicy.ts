/** Temporal gun/firearm policy for Grounding DINO (warning-only by default). */

import { subsampleCanvasToJpegDataUrl } from "../nsfw-frame-gate/nsfwFrameGatePolicy";

export { subsampleCanvasToJpegDataUrl };

/** Baseline from prior smoke; still configurable for 0.45 / 0.50 experiments. */
export const DEFAULT_WEAPON_MIN_SCORE = 0.42;
export const DEFAULT_WEAPON_REQUIRED_HITS = 2;
/** Fits ~10s sampling: enough room for a second independent inference. */
export const DEFAULT_WEAPON_WINDOW_MS = 35_000;
/** Local CPU Grounding DINO is ~8–12s/frame; keep below attempted 1 FPS. */
export const DEFAULT_WEAPON_INFERENCE_INTERVAL_MS = 10_000;
export const DEFAULT_WEAPON_JPEG_QUALITY = 0.72;
export const DEFAULT_WEAPON_MAX_EDGE = 640;
export const DEFAULT_WEAPON_AUTO_TERMINATE = false;

/** Gun-family only — knife/scissors stay on COCO sharp path. */
export const GUN_FAMILY_LABELS = new Set(["gun", "pistol", "rifle", "firearm"]);

/** Live gate backend: Subh775 ONNX (local primary), Custom YOLOX (A/B), or Grounding DINO. */
export type GunDetectorBackend = "grounding_dino" | "firearm_onnx" | "firearm_yolox";

export type WeaponEvidenceHit = {
  atMs: number;
  score: number;
  label: string;
  /** Dedup key for one inference response (label|score|box). */
  fingerprint: string;
};

export type WeaponGateState = "safe" | "warning" | "confirmed_risk";

export type WeaponGateResult = {
  state: WeaponGateState;
  /** @deprecated use `state` — kept briefly for call-site migration clarity */
  action: WeaponGateState;
  evidenceCount: number;
  requiredHits: number;
  latestScore: number | null;
  latestLabel: string | null;
  hits: WeaponEvidenceHit[];
  autoTerminates: boolean;
};

export type WeaponGateConfig = {
  minScore: number;
  requiredHits: number;
  windowMs: number;
  inferenceIntervalMs: number;
  jpegQuality: number;
  maxEdge: number;
  autoTerminate: boolean;
};

export type WeaponDetectionLike = {
  label: string;
  score: number;
  box?: number[];
};

export function readWeaponGateConfig(
  env: Record<string, string | undefined> = import.meta.env as Record<
    string,
    string | undefined
  >,
): WeaponGateConfig {
  return {
    minScore: parseEnvNumber(env.VITE_WEAPON_MIN_SCORE, DEFAULT_WEAPON_MIN_SCORE),
    requiredHits: Math.max(
      2,
      Math.floor(parseEnvNumber(env.VITE_WEAPON_REQUIRED_HITS, DEFAULT_WEAPON_REQUIRED_HITS)),
    ),
    windowMs: Math.max(
      10_000,
      Math.floor(parseEnvNumber(env.VITE_WEAPON_WINDOW_MS, DEFAULT_WEAPON_WINDOW_MS)),
    ),
    inferenceIntervalMs: Math.max(
      1_000,
      Math.floor(
        parseEnvNumber(
          env.VITE_WEAPON_INFERENCE_INTERVAL_MS,
          DEFAULT_WEAPON_INFERENCE_INTERVAL_MS,
        ),
      ),
    ),
    jpegQuality: clamp(
      parseEnvNumber(env.VITE_WEAPON_JPEG_QUALITY, DEFAULT_WEAPON_JPEG_QUALITY),
      0.4,
      0.95,
    ),
    maxEdge: Math.max(
      224,
      Math.floor(parseEnvNumber(env.VITE_WEAPON_MAX_EDGE, DEFAULT_WEAPON_MAX_EDGE)),
    ),
    autoTerminate: parseEnvBool(env.VITE_WEAPON_AUTO_TERMINATE, DEFAULT_WEAPON_AUTO_TERMINATE),
  };
}

export function isWeaponFrameGateUiEnabled(
  env: Record<string, string | undefined> = import.meta.env as Record<
    string,
    string | undefined
  >,
): boolean {
  const raw = (env.VITE_WEAPON_DETECTOR_ENABLED ?? "false").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function isGunFamilyLabel(label: string): boolean {
  return GUN_FAMILY_LABELS.has((label || "").trim().toLowerCase());
}

export function passesWeaponThreshold(score: number, minScore: number): boolean {
  return Number.isFinite(score) && score >= minScore;
}

/** Top gun-family detection at/above threshold, or null. */
export function pickTopGunHit(
  detections: WeaponDetectionLike[],
  minScore: number,
  atMs: number,
): WeaponEvidenceHit | null {
  let best: WeaponDetectionLike | null = null;
  for (const det of detections) {
    if (!isGunFamilyLabel(det.label)) {
      continue;
    }
    if (!passesWeaponThreshold(det.score, minScore)) {
      continue;
    }
    if (!best || det.score > best.score) {
      best = det;
    }
  }
  if (!best) {
    return null;
  }
  return {
    atMs,
    score: best.score,
    label: best.label.trim().toLowerCase(),
    fingerprint: buildDetectionFingerprint(best),
  };
}

export function buildDetectionFingerprint(det: WeaponDetectionLike): string {
  const box = (det.box ?? []).map((v) => Math.round(v)).join(",");
  return `${det.label.trim().toLowerCase()}|${det.score.toFixed(3)}|${box}`;
}

export function pruneWeaponEvidence(
  hits: WeaponEvidenceHit[],
  nowMs: number,
  windowMs: number,
): WeaponEvidenceHit[] {
  return hits.filter((hit) => nowMs - hit.atMs <= windowMs);
}

/**
 * Append at most one new gun-family hit per inference.
 * Drops duplicates (same fingerprint still in window) and ignores null.
 */
export function appendWeaponEvidence(
  previous: WeaponEvidenceHit[],
  hit: WeaponEvidenceHit | null,
  windowMs: number,
): WeaponEvidenceHit[] {
  const nowMs = hit?.atMs ?? Date.now();
  const pruned = pruneWeaponEvidence(previous, nowMs, windowMs);
  if (!hit) {
    return pruned;
  }
  if (!isGunFamilyLabel(hit.label) || !passesWeaponThreshold(hit.score, 0)) {
    return pruned;
  }
  if (pruned.some((existing) => existing.fingerprint === hit.fingerprint)) {
    return pruned;
  }
  // Same client timestamp = same response processed twice.
  if (pruned.some((existing) => existing.atMs === hit.atMs)) {
    return pruned;
  }
  return [...pruned, hit];
}

export function evaluateWeaponGate(
  hits: WeaponEvidenceHit[],
  config: Pick<WeaponGateConfig, "requiredHits" | "minScore" | "autoTerminate">,
): WeaponGateResult {
  const qualifying = hits.filter(
    (hit) => isGunFamilyLabel(hit.label) && passesWeaponThreshold(hit.score, config.minScore),
  );
  const latest = qualifying.length > 0 ? qualifying[qualifying.length - 1] : null;

  let state: WeaponGateState = "safe";
  if (qualifying.length >= config.requiredHits) {
    state = "confirmed_risk";
  } else if (qualifying.length >= 1) {
    state = "warning";
  }

  return {
    state,
    action: state,
    evidenceCount: qualifying.length,
    requiredHits: config.requiredHits,
    latestScore: latest?.score ?? null,
    latestLabel: latest?.label ?? null,
    hits: qualifying,
    // Never auto-close from a single hit; default remains false even if env is true
    // until a later slice wires termination after confirmed_risk.
    autoTerminates: false,
  };
}

/** Busy gate: drop new work while inference is in flight. */
export function shouldSkipBusySample(inFlight: boolean): boolean {
  return inFlight;
}

function parseEnvNumber(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function parseEnvBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const value = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(value)) {
    return false;
  }
  return fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
