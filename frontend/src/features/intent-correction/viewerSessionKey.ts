const VIEWER_KEY_STORAGE = "smart-livestream-viewer-key";

export function getOrCreateViewerSessionKey(): string {
  if (typeof window === "undefined") {
    return "server-side-viewer";
  }

  const existing = window.sessionStorage.getItem(VIEWER_KEY_STORAGE);
  if (existing) {
    return existing;
  }

  const created =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `viewer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  window.sessionStorage.setItem(VIEWER_KEY_STORAGE, created);
  return created;
}
