import { useEffect, useMemo, useState } from "react";

import {
  getSupabaseClient,
  isAuthConfigured,
  mapSupabaseUser,
  signInWithGoogle,
  signUpWithGoogle,
  signOut,
  type AuthUser,
} from "../../api/auth";

type OptionalAuthState = {
  configured: boolean;
  loading: boolean;
  user: AuthUser | null;
  error: string | null;
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
  const initiallyConfigured = useMemo(() => isAuthConfigured(), []);
  const [configured, setConfigured] = useState(initiallyConfigured);
  const [loading, setLoading] = useState(initiallyConfigured);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setConfigured(false);
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
            setConfigured(false);
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
          setConfigured(false);
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

  async function loginWithGoogle() {
    setError(null);
    try {
      await signInWithGoogle();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Cannot sign in with Google.");
    }
  }

  async function registerWithGoogle() {
    setError(null);
    try {
      await signUpWithGoogle();
    } catch (registerError) {
      setError(
        registerError instanceof Error ? registerError.message : "Cannot sign up with Google.",
      );
    }
  }

  async function logout() {
    setError(null);
    try {
      await signOut();
      setUser(null);
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : "Cannot sign out.");
    }
  }

  return {
    configured,
    loading,
    user,
    error,
    loginWithGoogle,
    registerWithGoogle,
    logout,
    clearError: () => setError(null),
  };
}
