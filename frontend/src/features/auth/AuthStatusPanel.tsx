import { useI18n } from "../../i18n/I18nProvider";
import type { AuthUser } from "../../api/auth";

type AuthStatusPanelProps = {
  configured: boolean;
  loading: boolean;
  user: AuthUser | null;
  error: string | null;
  onLogin: () => void;
  onRegister: () => void;
  onLogout: () => void;
};

export function AuthStatusPanel({
  configured,
  loading,
  user,
  error,
  onLogin,
  onRegister,
  onLogout,
}: AuthStatusPanelProps) {
  const { t } = useI18n();

  if (user) {
    return (
      <section className="authStatusPanel" aria-label={t("authPanelTitle")}>
        <div className="authStatusSignedIn">
          <span>{t("signedInAs", { name: user.displayName })}</span>
          {error ? <span className="authStatusError">{error}</span> : null}
        </div>
        <button type="button" className="authButton authButtonSecondary" onClick={onLogout}>
          {t("signOut")}
        </button>
      </section>
    );
  }

  return (
    <section className="authStatusPanel" aria-label={t("authPanelTitle")}>
      {error ? <span className="authStatusError">{error}</span> : null}
      <div className="authButtonRow">
        <button
          type="button"
          className="authButton"
          onClick={onLogin}
          disabled={!configured || loading}
        >
          {loading ? t("authLoading") : t("signIn")}
        </button>
        <button
          type="button"
          className="authButton authButtonSecondary"
          onClick={onRegister}
          disabled={!configured || loading}
        >
          {t("signUp")}
        </button>
      </div>
    </section>
  );
}
