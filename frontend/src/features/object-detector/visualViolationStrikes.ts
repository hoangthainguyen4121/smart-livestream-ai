/** Count Visual Safety warnings toward livestream end threshold. */

export const VISUAL_VIOLATION_STRIKE_LIMIT = 5;
/** While a warning stays active, add +1 every dwell interval. */
export const VISUAL_VIOLATION_DWELL_MS = 3_000;

export type VisualViolationChannels = {
  adult: boolean;
  gun: boolean;
  sharp: boolean;
};

export type VisualViolationStrikeState = {
  count: number;
  channels: VisualViolationChannels;
  limitReached: boolean;
  /** Timestamp (ms) of the last strike (rising-edge or dwell tick). */
  lastStrikeAtMs: number | null;
};

export const EMPTY_VIOLATION_CHANNELS: VisualViolationChannels = {
  adult: false,
  gun: false,
  sharp: false,
};

export function createVisualViolationStrikeState(): VisualViolationStrikeState {
  return {
    count: 0,
    channels: { ...EMPTY_VIOLATION_CHANNELS },
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
 * Increment on channel rising edge (safe→warning), and again every `dwellMs`
 * while any warning channel stays active.
 */
export function applyVisualViolationChannels(
  previous: VisualViolationStrikeState,
  nextChannels: VisualViolationChannels,
  nowMs: number,
  options?: {
    limit?: number;
    dwellMs?: number;
  },
): VisualViolationStrikeState {
  const limit = options?.limit ?? VISUAL_VIOLATION_STRIKE_LIMIT;
  const dwellMs = options?.dwellMs ?? VISUAL_VIOLATION_DWELL_MS;

  if (previous.limitReached) {
    return {
      ...previous,
      channels: nextChannels,
    };
  }

  let delta = 0;
  let lastStrikeAtMs = previous.lastStrikeAtMs;

  if (nextChannels.adult && !previous.channels.adult) {
    delta += 1;
  }
  if (nextChannels.gun && !previous.channels.gun) {
    delta += 1;
  }
  if (nextChannels.sharp && !previous.channels.sharp) {
    delta += 1;
  }

  const active = anyVisualViolationActive(nextChannels);

  if (delta > 0) {
    lastStrikeAtMs = nowMs;
  } else if (active && lastStrikeAtMs != null && dwellMs > 0) {
    const elapsed = nowMs - lastStrikeAtMs;
    const ticks = Math.floor(elapsed / dwellMs);
    if (ticks >= 1) {
      delta += ticks;
      lastStrikeAtMs += ticks * dwellMs;
    }
  }

  if (!active) {
    lastStrikeAtMs = null;
  }

  const count = previous.count + delta;
  return {
    count,
    channels: nextChannels,
    limitReached: count >= limit,
    lastStrikeAtMs,
  };
}
