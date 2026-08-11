const HOSTED_ROOMS_STORAGE_KEY = "smart-livestream.hostedRoomIds";

function readHostedRoomIds(): Set<string> {
  if (typeof window === "undefined") {
    return new Set();
  }
  try {
    const raw = window.sessionStorage.getItem(HOSTED_ROOMS_STORAGE_KEY);
    if (!raw) {
      return new Set();
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return new Set(parsed.filter((value): value is string => typeof value === "string" && value.length > 0));
  } catch {
    return new Set();
  }
}

function writeHostedRoomIds(ids: Set<string>): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(HOSTED_ROOMS_STORAGE_KEY, JSON.stringify([...ids]));
}

/** Local-only host claim for rooms created in this browser tab session. Not secure RBAC. */
export function markRoomAsHosted(roomId: string): void {
  const normalized = roomId.trim();
  if (!normalized) {
    return;
  }
  const ids = readHostedRoomIds();
  ids.add(normalized);
  writeHostedRoomIds(ids);
}

export function isLocalHostForRoom(roomId: string): boolean {
  return readHostedRoomIds().has(roomId.trim());
}

export function clearHostedRoomsForTests(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(HOSTED_ROOMS_STORAGE_KEY);
}
