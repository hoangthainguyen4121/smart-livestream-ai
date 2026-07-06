import { useI18n } from "../../i18n/I18nProvider";
import type { AuthUser } from "../../api/auth";

type AuthStatusPanelProps = {
  configured: boolean;
  loading: boolean;
  user: AuthUser | null;
  error: string | null;
  onLogin: () => void;
  onLogout: () => void;
};

export function AuthStatusPanel({
  configured,
  loading,
  user,
  error,
  onLogin,
  onLogout,
}: AuthStatusPanelProps) {
  const { t } = useI18n();

  return (
    <section className="authStatusPanel" aria-label={t("authPanelTitle")}>
      <div className="authStatusText">
        <span className="authStatusTitle">{t("authPanelTitle")}</span>
        <span>
          {user
            ? t("signedInAs", { name: user.displayName })
            : configured
              ? t("guestModeActive")
              : t("authNotConfigured")}
        </span>
        {error ? <span className="authStatusError">{error}</span> : null}
      </div>
      {user ? (
        <button type="button" className="authButton authButtonSecondary" onClick={onLogout}>
          {t("signOut")}
        </button>
      ) : (
        <button
          type="button"
          className="authButton"
          onClick={onLogin}
          disabled={!configured || loading}
        >
          {loading ? t("authLoading") : t("signInWithGoogle")}
        </button>
      )}
    </section>
  );
}
