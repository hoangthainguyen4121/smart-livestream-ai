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
