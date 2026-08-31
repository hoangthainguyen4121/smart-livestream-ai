import { useEffect, useState } from "react";

import {
  getAuthToken,
  getCurrentUser,
  getSupabaseClient,
  isAuthConfigured,
  loginWithPassword,
  mapSupabaseUser,
  registerWithPassword,
  signInWithGoogle,
  signUpWithGoogle,
  signOut,
  type AuthUser,
} from "../../api/auth";

type OptionalAuthState = {
  configured: boolean;
  googleConfigured: boolean;
  loading: boolean;
  user: AuthUser | null;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  registerWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
};

function isAuthNetworkError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes("nxdomain") ||
    normalized.includes("could not be resolved")
  );
}

export function useOptionalAuth(): OptionalAuthState {
  const configured = true;
  const googleConfigured = isAuthConfigured();
  const [loading, setLoading] = useState(Boolean(getAuthToken()));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (getAuthToken()) {
      let mounted = true;
      void getCurrentUser()
        .then((current) => {
          if (mounted) setUser(current);
        })
        .catch((currentError) => {
          if (mounted) {
            setError(
              currentError instanceof Error
                ? currentError.message
                : "Không tải được tài khoản hiện tại.",
            );
          }
        })
        .finally(() => {
          if (mounted) setLoading(false);
        });
      return () => {
        mounted = false;
      };
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data, error: sessionError }) => {
        if (!mounted) {
          return;
        }
        if (sessionError) {
          if (isAuthNetworkError(sessionError.message)) {
            setError("authUnreachable");
            return;
          }
          setError(sessionError.message);
          return;
        }
        setUser(data.session?.user ? mapSupabaseUser(data.session.user) : null);
      })
      .catch((sessionError) => {
        if (!mounted) {
          return;
        }
        const message =
          sessionError instanceof Error ? sessionError.message : "Cannot reach Supabase auth.";
        if (isAuthNetworkError(message)) {
          setError("authUnreachable");
          return;
        }
        setError(message);
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? mapSupabaseUser(session.user) : null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function login(email: string, password: string) {
    setLoading(true);
    setError(null);
    try {
      setUser(await loginWithPassword(email, password));
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Không thể đăng nhập.");
      throw loginError;
    } finally {
      setLoading(false);
    }
  }

  async function register(email: string, password: string, displayName?: string) {
    setLoading(true);
    setError(null);
    try {
      setUser(await registerWithPassword(email, password, displayName));
    } catch (registerError) {
      setError(registerError instanceof Error ? registerError.message : "Không thể đăng ký tài khoản.");
      throw registerError;
    } finally {
      setLoading(false);
    }
  }

  async function loginWithGoogle() {
    setError(null);
    try {
      await signInWithGoogle();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Không thể đăng nhập bằng Google.");
    }
  }

  async function registerWithGoogle() {
    setError(null);
    try {
      await signUpWithGoogle();
    } catch (registerError) {
      setError(
        registerError instanceof Error ? registerError.message : "Không thể đăng ký bằng Google.",
      );
    }
  }

  async function logout() {
    setError(null);
    try {
      await signOut();
      setUser(null);
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : "Không thể đăng xuất.");
    }
  }

  return {
    configured,
    googleConfigured,
    loading,
    user,
    error,
    login,
    register,
    loginWithGoogle,
    registerWithGoogle,
    logout,
    clearError: () => setError(null),
  };
}
