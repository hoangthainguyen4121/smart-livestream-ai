/** Count Visual Safety warnings toward livestream end threshold. */

export const VISUAL_VIOLATION_STRIKE_LIMIT = 5;
/** While a warning stays active, add +1 every dwell interval. */
export const VISUAL_VIOLATION_DWELL_MS = 3_000;

export type VisualViolationChannels = {
  adult: boolean;
  gun: boolean;
  sharp: boolean;
};

export type VisualViolationEvidenceCounts = {
  adult: number;
  gun: number;
  sharp: number;
};

export type VisualViolationStrikeState = {
  count: number;
  channels: VisualViolationChannels;
  evidenceCounts: VisualViolationEvidenceCounts;
  limitReached: boolean;
  /** Timestamp (ms) of the last counted evidence. */
  lastStrikeAtMs: number | null;
};

export const EMPTY_VIOLATION_CHANNELS: VisualViolationChannels = {
  adult: false,
  gun: false,
  sharp: false,
};

export const EMPTY_VIOLATION_EVIDENCE_COUNTS: VisualViolationEvidenceCounts = {
  adult: 0,
  gun: 0,
  sharp: 0,
};

export function createVisualViolationStrikeState(): VisualViolationStrikeState {
  return {
    count: 0,
    channels: { ...EMPTY_VIOLATION_CHANNELS },
    evidenceCounts: { ...EMPTY_VIOLATION_EVIDENCE_COUNTS },
    limitReached: false,
    lastStrikeAtMs: null,
  };
}

export function anyVisualViolationActive(channels: VisualViolationChannels): boolean {
  return channels.adult || channels.gun || channels.sharp;
}

/** True when adult gate is in a warning taxonomy state. */
export function isAdultViolationActive(state: string | null | undefined): boolean {
  return state === "SUGGESTIVE" || state === "EXPLICIT";
}

/** True when gun gate is warning or confirmed risk. */
export function isGunViolationActive(state: string | null | undefined): boolean {
  return state === "warning" || state === "confirmed_risk";
}

/** True when sharp-object enforcement is warning or terminating. */
export function isSharpViolationActive(action: string | null | undefined): boolean {
  return action === "warning" || action === "terminate";
}

/**
 * Count independent violation evidence only.
 *
 * A warning state may remain visible for a temporal window after the object was
 * removed from camera. Do not convert that stale state into new strikes.
 */
export function applyVisualViolationChannels(
  previous: VisualViolationStrikeState,
  nextChannels: VisualViolationChannels,
  nowMs: number,
  options?: {
    limit?: number;
    dwellMs?: number;
    evidenceCounts?: Partial<VisualViolationEvidenceCounts>;
  },
): VisualViolationStrikeState {
  const limit = options?.limit ?? VISUAL_VIOLATION_STRIKE_LIMIT;
  const nextEvidenceCounts = normalizeEvidenceCounts(
    nextChannels,
    previous.evidenceCounts ?? EMPTY_VIOLATION_EVIDENCE_COUNTS,
    options?.evidenceCounts,
  );

  if (previous.limitReached) {
    return {
      ...previous,
      channels: nextChannels,
      evidenceCounts: nextEvidenceCounts,
    };
  }

  let delta = 0;
  let lastStrikeAtMs = previous.lastStrikeAtMs;

  for (const channel of ["adult", "gun", "sharp"] as const) {
    if (!nextChannels[channel]) {
      continue;
    }
    const previousEvidence = Math.max(0, previous.evidenceCounts?.[channel] ?? 0);
    const nextEvidence = Math.max(0, nextEvidenceCounts[channel]);
    if (!previous.channels[channel]) {
      delta += 1;
      continue;
    }
    const evidenceDelta = nextEvidence - previousEvidence;
    if (evidenceDelta > 0) {
      delta += evidenceDelta;
    }
  }

  if (delta > 0) {
    lastStrikeAtMs = nowMs;
  } else if (!anyVisualViolationActive(nextChannels)) {
    lastStrikeAtMs = null;
  }

  const count = previous.count + delta;
  return {
    count,
    channels: nextChannels,
    evidenceCounts: nextEvidenceCounts,
    limitReached: count >= limit,
    lastStrikeAtMs,
  };
}

function normalizeEvidenceCounts(
  channels: VisualViolationChannels,
  previous: VisualViolationEvidenceCounts,
  evidenceCounts?: Partial<VisualViolationEvidenceCounts>,
): VisualViolationEvidenceCounts {
  return {
    adult: normalizeEvidenceCount(channels.adult, previous.adult, evidenceCounts?.adult),
    gun: normalizeEvidenceCount(channels.gun, previous.gun, evidenceCounts?.gun),
    sharp: normalizeEvidenceCount(channels.sharp, previous.sharp, evidenceCounts?.sharp),
  };
}

function normalizeEvidenceCount(
  active: boolean,
  previous: number,
  next: number | undefined,
): number {
  if (!active) {
    return 0;
  }
  if (next === undefined || !Number.isFinite(next)) {
    return previous;
  }
  return Math.max(0, Math.floor(next));
}
