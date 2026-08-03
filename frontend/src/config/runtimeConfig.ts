type RuntimeConfig = {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
};

declare global {
  interface Window {
    __RUNTIME_CONFIG__?: RuntimeConfig;
  }
}

function readNonEmpty(value: string | undefined): string | undefined {
  if (!value || !value.trim()) {
    return undefined;
  }
  return value.trim();
}

function getRuntimeConfig(): RuntimeConfig | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.__RUNTIME_CONFIG__;
}

export function getSupabaseUrl(): string | undefined {
  return (
    readNonEmpty(getRuntimeConfig()?.VITE_SUPABASE_URL) ??
    readNonEmpty(import.meta.env.VITE_SUPABASE_URL)
  );
}

export function getSupabaseAnonKey(): string | undefined {
  return (
    readNonEmpty(getRuntimeConfig()?.VITE_SUPABASE_ANON_KEY) ??
    readNonEmpty(import.meta.env.VITE_SUPABASE_ANON_KEY)
  );
}

const SUPABASE_HOST_PATTERN = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i;

const SUPABASE_PLACEHOLDER_MARKERS = [
  "YOUR-PROJECT-REF",
  "your-supabase-anon-public-key",
  "example.supabase.co",
];

export function isSupabaseRuntimeConfigured(): boolean {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) {
    return false;
  }
  if (!SUPABASE_HOST_PATTERN.test(url)) {
    return false;
  }
  return !SUPABASE_PLACEHOLDER_MARKERS.some(
    (marker) => url.includes(marker) || key.includes(marker),
  );
}
