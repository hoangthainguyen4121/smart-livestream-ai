/** Temporal evidence + warning-only policy for Adult/NSFW frame-gate (no auto-terminate). */

export const DEFAULT_NSFW_MIN_SCORE = 0.7;
export const DEFAULT_NSFW_REQUIRED_HITS = 2;
export const DEFAULT_NSFW_WINDOW_MS = 5_000;
export const DEFAULT_NSFW_INFERENCE_INTERVAL_MS = 1_000;
export const DEFAULT_NSFW_JPEG_QUALITY = 0.72;
export const DEFAULT_NSFW_MAX_EDGE = 448;

export type NsfwEvidenceHit = {
  atMs: number;
  nsfwScore: number;
  label: string;
};

export type NsfwGateAction = "none" | "warning";

export type NsfwGateResult = {
  action: NsfwGateAction;
  evidenceCount: number;
  requiredHits: number;
  latestNsfwScore: number | null;
  hits: NsfwEvidenceHit[];
};

export type NsfwGateConfig = {
  minScore: number;
  requiredHits: number;
  windowMs: number;
  inferenceIntervalMs: number;
  jpegQuality: number;
  maxEdge: number;
};

export function readNsfwGateConfig(
  env: Record<string, string | undefined> = import.meta.env as Record<
    string,
    string | undefined
  >,
): NsfwGateConfig {
  return {
    minScore: parseEnvNumber(env.VITE_NSFW_MIN_SCORE, DEFAULT_NSFW_MIN_SCORE),
    requiredHits: Math.max(
      1,
      Math.floor(parseEnvNumber(env.VITE_NSFW_REQUIRED_HITS, DEFAULT_NSFW_REQUIRED_HITS)),
    ),
    windowMs: Math.max(
      1,
      Math.floor(parseEnvNumber(env.VITE_NSFW_WINDOW_MS, DEFAULT_NSFW_WINDOW_MS)),
    ),
    inferenceIntervalMs: Math.max(
      250,
      Math.floor(
        parseEnvNumber(env.VITE_NSFW_INFERENCE_INTERVAL_MS, DEFAULT_NSFW_INFERENCE_INTERVAL_MS),
      ),
    ),
    jpegQuality: clamp(
      parseEnvNumber(env.VITE_NSFW_JPEG_QUALITY, DEFAULT_NSFW_JPEG_QUALITY),
      0.4,
      0.95,
    ),
    maxEdge: Math.max(
      224,
      Math.floor(parseEnvNumber(env.VITE_NSFW_MAX_EDGE, DEFAULT_NSFW_MAX_EDGE)),
    ),
  };
}

export function isNsfwFrameGateUiEnabled(
  env: Record<string, string | undefined> = import.meta.env as Record<
    string,
    string | undefined
  >,
): boolean {
  const raw = (env.VITE_NSFW_FRAME_GATE_ENABLED ?? "false").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function pruneNsfwEvidence(
  hits: NsfwEvidenceHit[],
  nowMs: number,
  windowMs: number,
): NsfwEvidenceHit[] {
  return hits.filter((hit) => nowMs - hit.atMs <= windowMs);
}

export function appendNsfwEvidence(
  previous: NsfwEvidenceHit[],
  hit: NsfwEvidenceHit | null,
  windowMs: number,
): NsfwEvidenceHit[] {
  const nowMs = hit?.atMs ?? Date.now();
  const pruned = pruneNsfwEvidence(previous, nowMs, windowMs);
  if (!hit) {
    return pruned;
  }
  return [...pruned, hit];
}

export function evaluateNsfwGate(
  hits: NsfwEvidenceHit[],
  config: Pick<NsfwGateConfig, "requiredHits" | "minScore">,
): NsfwGateResult {
  const qualifying = hits.filter((hit) => hit.nsfwScore >= config.minScore);
  const latest = qualifying.length > 0 ? qualifying[qualifying.length - 1] : null;
  const action: NsfwGateAction =
    qualifying.length >= config.requiredHits ? "warning" : "none";
  return {
    action,
    evidenceCount: qualifying.length,
    requiredHits: config.requiredHits,
    latestNsfwScore: latest?.nsfwScore ?? null,
    hits: qualifying,
  };
}

/** Downscale canvas and encode JPEG data URL for private backend classify. */
export function subsampleCanvasToJpegDataUrl(
  source: HTMLCanvasElement,
  options: { maxEdge: number; jpegQuality: number },
): string | null {
  if (source.width < 2 || source.height < 2) {
    return null;
  }

  const scale = Math.min(1, options.maxEdge / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));

  const temp = document.createElement("canvas");
  temp.width = width;
  temp.height = height;
  const ctx = temp.getContext("2d", { willReadFrequently: false });
  if (!ctx) {
    return null;
  }
  ctx.drawImage(source, 0, 0, width, height);
  return temp.toDataURL("image/jpeg", options.jpegQuality);
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
