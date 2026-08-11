/** Local file → object URL helpers for the CV test harness (no upload). */

export function createVideoObjectUrl(file: File): string {
  return URL.createObjectURL(file);
}

export function revokeVideoObjectUrl(url: string | null | undefined): void {
  if (!url) {
    return;
  }
  try {
    URL.revokeObjectURL(url);
  } catch {
    // ignore double-revoke
  }
}

export function isAcceptedVideoFile(file: File): boolean {
  if (!file) {
    return false;
  }
  if (file.type.startsWith("video/")) {
    return true;
  }
  // Some OS pickers omit MIME; allow common extensions.
  return /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(file.name);
}

export function formatVideoClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "00:00";
  }
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
