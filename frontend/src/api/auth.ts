import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

import { getSupabaseAnonKey, getSupabaseUrl } from "../config/runtimeConfig";

let client: SupabaseClient | null = null;
let clientKey: string | null = null;

export type AuthUser = {
  id: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
};

export function isAuthConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey());
}

export function getSupabaseClient(): SupabaseClient | null {
  const supabaseUrl = getSupabaseUrl();
  const supabaseAnonKey = getSupabaseAnonKey();
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  if (!client || clientKey !== `${supabaseUrl}|${supabaseAnonKey}`) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    clientKey = `${supabaseUrl}|${supabaseAnonKey}`;
  }

  return client;
}

export function mapSupabaseUser(user: User): AuthUser {
  const metadata = user.user_metadata ?? {};
  const displayName =
    firstString(metadata.full_name, metadata.name, metadata.preferred_username) ??
    user.email?.split("@")[0] ??
    "guest";

  return {
    id: user.id,
    email: user.email ?? null,
    displayName,
    avatarUrl: firstString(metadata.avatar_url, metadata.picture),
  };
}

function getAuthRedirectUrl(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

export async function signInWithGoogle(): Promise<void> {
  await startGoogleOAuth("login");
}

export async function signUpWithGoogle(): Promise<void> {
  await startGoogleOAuth("signup");
}

async function startGoogleOAuth(mode: "login" | "signup"): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase auth is not configured.");
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: getAuthRedirectUrl(),
      queryParams:
        mode === "signup"
          ? { prompt: "consent", access_type: "online" }
          : { access_type: "online" },
    },
  });

  if (error) {
    throw error;
  }
}

export async function signOut(): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return;
  }

  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}
