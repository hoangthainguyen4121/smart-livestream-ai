const HOST_TOKENS_STORAGE_KEY = "smart-livestream.hostResumeTokens";

type HostTokenRecord = {
  token: string;
  sessionId?: string;
  savedAt: string;
};

function readTokenMap(): Record<string, HostTokenRecord> {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(HOST_TOKENS_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed as Record<string, HostTokenRecord>;
  } catch {
    return {};
  }
}

function writeTokenMap(map: Record<string, HostTokenRecord>): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(HOST_TOKENS_STORAGE_KEY, JSON.stringify(map));
}

/** Persist resumable host token across browser restarts (within lease grace). */
export function saveHostResumeToken(
  roomId: string,
  token: string,
  sessionId?: string,
): void {
  const normalized = roomId.trim();
  if (!normalized || !token.trim()) {
    return;
  }
  const map = readTokenMap();
  map[normalized] = {
    token: token.trim(),
    sessionId,
    savedAt: new Date().toISOString(),
  };
  writeTokenMap(map);
}

export function getHostResumeToken(roomId: string): string | null {
  const entry = readTokenMap()[roomId.trim()];
  return entry?.token ?? null;
}

export function clearHostResumeToken(roomId: string): void {
  const map = readTokenMap();
  delete map[roomId.trim()];
  writeTokenMap(map);
}

export function clearHostResumeTokensForTests(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(HOST_TOKENS_STORAGE_KEY);
}
