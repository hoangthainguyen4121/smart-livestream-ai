import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

import { getSupabaseAnonKey, getSupabaseUrl, isSupabaseRuntimeConfigured } from "../config/runtimeConfig";
import { getApiBaseUrl } from "./config";

let client: SupabaseClient | null = null;
let clientKey: string | null = null;

export type AuthUser = {
  id: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
};

const TOKEN_KEY = "smart-livestream.auth-token";

type AuthResponse = {
  token?: string;
  access_token?: string;
  user: Record<string, unknown>;
};

export function getAuthToken(): string | null {
  return typeof window === "undefined" ? null : window.localStorage.getItem(TOKEN_KEY);
}

export function clearAuthToken(): void {
  if (typeof window !== "undefined") window.localStorage.removeItem(TOKEN_KEY);
}

export function authHeaders(token = getAuthToken()): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function loginWithPassword(email: string, password: string): Promise<AuthUser> {
  return passwordAuth("/api/auth/login", { email, password });
}

export async function registerWithPassword(
  email: string,
  password: string,
  displayName?: string,
): Promise<AuthUser> {
  return passwordAuth("/api/auth/register", {
    email,
    password,
    display_name: displayName?.trim() || undefined,
  });
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = getAuthToken();
  if (!token) return null;
  const response = await fetch(`${getApiBaseUrl()}/api/auth/me`, {
    headers: authHeaders(token),
  });
  if (response.status === 401) {
    clearAuthToken();
    return null;
  }
  if (!response.ok) throw await apiError(response, "Không tải được tài khoản hiện tại.");
  return mapApiUser((await response.json()) as Record<string, unknown>);
}

async function passwordAuth(
  path: string,
  payload: Record<string, unknown>,
): Promise<AuthUser> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await apiError(response, "Không thể xác thực tài khoản.");
  const body = (await response.json()) as AuthResponse;
  const token = body.token ?? body.access_token;
  if (!token || !body.user) throw new Error("Máy chủ trả về dữ liệu đăng nhập không hợp lệ.");
  if (typeof window !== "undefined") window.localStorage.setItem(TOKEN_KEY, token);
  return mapApiUser(body.user);
}

export function mapApiUser(user: Record<string, unknown>): AuthUser {
  const email = typeof user.email === "string" ? user.email : null;
  return {
    id: String(user.id ?? ""),
    email,
    displayName:
      firstString(user.display_name, user.displayName, user.name) ??
      email?.split("@")[0] ??
      "user",
    avatarUrl: firstString(user.avatar_url, user.avatarUrl),
  };
}

async function apiError(response: Response, fallback: string): Promise<Error> {
  const byStatus = AUTH_ERROR_BY_STATUS[response.status];
  if (byStatus) return new Error(byStatus);
  try {
    const body = (await response.json()) as { detail?: unknown; message?: unknown };
    const detail = body.detail ?? body.message;
    if (typeof detail === "string") return new Error(detail);
  } catch {
    // Use status fallback.
  }
  return new Error(`${fallback} (mã ${response.status})`);
}

// Backend trả detail tiếng Anh; hiển thị thông báo tiếng Việt theo mã lỗi.
const AUTH_ERROR_BY_STATUS: Record<number, string> = {
  401: "Email hoặc mật khẩu không đúng. Hãy kiểm tra lại.",
  403: "Tài khoản này không có quyền truy cập.",
  409: "Email này đã được đăng ký. Hãy đăng nhập thay vì tạo tài khoản mới.",
  422: "Thông tin chưa hợp lệ: email phải đúng định dạng và mật khẩu tối thiểu 8 ký tự.",
  429: "Bạn thử quá nhiều lần. Hãy đợi một lát rồi thử lại.",
  500: "Máy chủ đang gặp sự cố. Hãy thử lại sau.",
};

export function isAuthConfigured(): boolean {
  return isSupabaseRuntimeConfigured();
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
  clearAuthToken();
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
