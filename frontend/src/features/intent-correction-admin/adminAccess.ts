const ADMIN_API_KEY_STORAGE = "smart-livestream.adminApiKey";
const ADMIN_REVIEWER_STORAGE = "smart-livestream.adminReviewer";

export function getConfiguredAdminApiKey(): string | undefined {
  const fromEnv = import.meta.env.VITE_ADMIN_API_KEY?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  if (typeof window === "undefined") {
    return undefined;
  }
  const stored = window.sessionStorage.getItem(ADMIN_API_KEY_STORAGE)?.trim();
  return stored || undefined;
}

export function saveAdminApiKey(value: string): void {
  window.sessionStorage.setItem(ADMIN_API_KEY_STORAGE, value.trim());
}

export function getAdminReviewerLabel(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  const stored = window.sessionStorage.getItem(ADMIN_REVIEWER_STORAGE)?.trim();
  return stored || undefined;
}

export function saveAdminReviewerLabel(value: string): void {
  window.sessionStorage.setItem(ADMIN_REVIEWER_STORAGE, value.trim());
}

export function isAdminRoute(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.location.hash === "#/admin/intent-corrections";
}
