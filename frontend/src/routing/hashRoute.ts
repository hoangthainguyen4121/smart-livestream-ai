export type AppRoute =
  | { name: "rooms" }
  | { name: "live"; roomId: string }
  | { name: "admin" }
  | { name: "cvTest" };

export function parseHashRoute(hash: string): AppRoute {
  const raw = (hash || "").replace(/^#/, "").trim();
  const path = raw.startsWith("/") ? raw : raw ? `/${raw}` : "/";

  if (path === "/admin/intent-corrections") {
    return { name: "admin" };
  }

  if (path === "/dev/cv-test" || path === "/dev/cv-test/") {
    return { name: "cvTest" };
  }

  const liveMatch = path.match(/^\/live\/([^/?#]+)\/?$/);
  if (liveMatch) {
    return { name: "live", roomId: decodeURIComponent(liveMatch[1]) };
  }

  return { name: "rooms" };
}

export function roomsPath(): string {
  return "#/";
}

export function liveRoomPath(roomId: string): string {
  return `#/live/${encodeURIComponent(roomId)}`;
}

export function adminPath(): string {
  return "#/admin/intent-corrections";
}

export function cvTestPath(): string {
  return "#/dev/cv-test";
}

export function navigateHash(path: string): void {
  const next = path.startsWith("#") ? path : `#${path.startsWith("/") ? path : `/${path}`}`;
  if (window.location.hash === next) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    return;
  }
  window.location.hash = next;
}
