/** Temporal evidence for adult taxonomy SAFE | SUGGESTIVE | EXPLICIT (no auto-terminate). */

import type { AdultState } from "../../api/adultModeration";
import { subsampleCanvasToJpegDataUrl } from "../nsfw-frame-gate/nsfwFrameGatePolicy";

export { subsampleCanvasToJpegDataUrl };

export const DEFAULT_ADULT_REQUIRED_HITS = 2;
/** EXPLICIT needs stronger persistence than SUGGESTIVE. */
export const DEFAULT_ADULT_EXPLICIT_REQUIRED_HITS = 3;
export const DEFAULT_ADULT_WINDOW_MS = 5_000;
export const DEFAULT_ADULT_INFERENCE_INTERVAL_MS = 1_500;
export const DEFAULT_ADULT_JPEG_QUALITY = 0.72;
export const DEFAULT_ADULT_MAX_EDGE = 448;

export type AdultEvidenceHit = {
  atMs: number;
  state: AdultState;
  score: number | null;
  label: string | null;
};

export type AdultGateResult = {
  state: AdultState;
  evidenceCount: number;
  requiredHits: number;
  suggestiveEvidenceCount: number;
  explicitEvidenceCount: number;
  hits: AdultEvidenceHit[];
};

export type AdultGateConfig = {
  requiredHits: number;
  explicitRequiredHits: number;
  windowMs: number;
  inferenceIntervalMs: number;
  jpegQuality: number;
  maxEdge: number;
};

export function readAdultGateConfig(
  env: Record<string, string | undefined> = import.meta.env as Record<
    string,
    string | undefined
  >,
): AdultGateConfig {
  return {
    requiredHits: Math.max(
      1,
      Math.floor(parseEnvNumber(env.VITE_ADULT_REQUIRED_HITS, DEFAULT_ADULT_REQUIRED_HITS)),
    ),
    explicitRequiredHits: Math.max(
      2,
      Math.floor(
        parseEnvNumber(
          env.VITE_ADULT_EXPLICIT_REQUIRED_HITS,
          DEFAULT_ADULT_EXPLICIT_REQUIRED_HITS,
        ),
      ),
    ),
    windowMs: Math.max(
      1,
      Math.floor(parseEnvNumber(env.VITE_ADULT_WINDOW_MS, DEFAULT_ADULT_WINDOW_MS)),
    ),
    inferenceIntervalMs: Math.max(
      500,
      Math.floor(
        parseEnvNumber(
          env.VITE_ADULT_INFERENCE_INTERVAL_MS,
          DEFAULT_ADULT_INFERENCE_INTERVAL_MS,
        ),
      ),
    ),
    jpegQuality: clamp(
      parseEnvNumber(env.VITE_ADULT_JPEG_QUALITY, DEFAULT_ADULT_JPEG_QUALITY),
      0.4,
      0.95,
    ),
    maxEdge: Math.max(
      224,
      Math.floor(parseEnvNumber(env.VITE_ADULT_MAX_EDGE, DEFAULT_ADULT_MAX_EDGE)),
    ),
  };
}

/** Adult UI on when dedicated flag or legacy NSFW UI flag is enabled. */
export function isAdultModerationUiEnabled(
  env: Record<string, string | undefined> = import.meta.env as Record<
    string,
    string | undefined
  >,
): boolean {
  return envFlag(env.VITE_ADULT_MODERATION_ENABLED) || envFlag(env.VITE_NSFW_FRAME_GATE_ENABLED);
}

export function pruneAdultEvidence(
  hits: AdultEvidenceHit[],
  nowMs: number,
  windowMs: number,
): AdultEvidenceHit[] {
  return hits.filter((hit) => nowMs - hit.atMs <= windowMs);
}

export function appendAdultEvidence(
  previous: AdultEvidenceHit[],
  hit: AdultEvidenceHit | null,
  windowMs: number,
): AdultEvidenceHit[] {
  const nowMs = hit?.atMs ?? Date.now();
  const pruned = pruneAdultEvidence(previous, nowMs, windowMs);
  if (!hit) {
    return pruned;
  }
  return [...pruned, hit];
}

/**
 * Temporal confirmation:
 * - EXPLICIT needs more repeated EXPLICIT frames than SUGGESTIVE
 * - SUGGESTIVE needs repeated SUGGESTIVE or EXPLICIT frames
 * - else SAFE (single-frame FP ignored)
 */
export function evaluateAdultGate(
  hits: AdultEvidenceHit[],
  config: Pick<AdultGateConfig, "requiredHits" | "explicitRequiredHits">,
): AdultGateResult {
  const elevated = hits.filter((hit) => hit.state === "SUGGESTIVE" || hit.state === "EXPLICIT");
  const explicitHits = elevated.filter((hit) => hit.state === "EXPLICIT");
  const suggestiveHits = elevated;
  const explicitNeed = config.explicitRequiredHits ?? Math.max(config.requiredHits + 1, 3);

  let state: AdultState = "SAFE";
  if (explicitHits.length >= explicitNeed) {
    state = "EXPLICIT";
  } else if (suggestiveHits.length >= config.requiredHits) {
    state = "SUGGESTIVE";
  }

  return {
    state,
    evidenceCount: elevated.length,
    requiredHits: config.requiredHits,
    suggestiveEvidenceCount: suggestiveHits.length,
    explicitEvidenceCount: explicitHits.length,
    hits: elevated,
  };
}

function envFlag(raw: string | undefined): boolean {
  const value = (raw ?? "false").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function parseEnvNumber(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
