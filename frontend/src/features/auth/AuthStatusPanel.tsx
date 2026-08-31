import { useI18n } from "../../i18n/I18nProvider";
import type { AuthUser } from "../../api/auth";
import { useState, type FormEvent } from "react";

type AuthStatusPanelProps = {
  configured: boolean;
  loading: boolean;
  user: AuthUser | null;
  error: string | null;
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, password: string, displayName?: string) => Promise<void>;
  onGoogleLogin?: () => void;
  onLogout: () => void;
};

export function AuthStatusPanel({
  configured,
  loading,
  user,
  error,
  onLogin,
  onRegister,
  onGoogleLogin,
  onLogout,
}: AuthStatusPanelProps) {
  const { t } = useI18n();
  const [registering, setRegistering] = useState(false);
  const errorMessage =
    error === "authUnreachable" ? t("authUnreachable") : error;

  if (user) {
    return (
      <section className="authStatusPanel" aria-label={t("authPanelTitle")}>
        <div className="authStatusSignedIn">
          <strong>{t("signedInAs", { name: user.displayName })}</strong>
          {user.email ? <span>{user.email}</span> : null}
          {errorMessage ? <span className="authStatusError">{errorMessage}</span> : null}
        </div>
        <button type="button" className="authButton authButtonSecondary" onClick={onLogout}>
          {t("signOut")}
        </button>
      </section>
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const displayName = String(form.get("displayName") ?? "");
    void (registering
      ? onRegister(email, password, displayName)
      : onLogin(email, password)).catch(() => undefined);
  }

  return (
    <section className="authStatusPanel" aria-label={t("authPanelTitle")}>
      {errorMessage ? <span className="authStatusError">{errorMessage}</span> : null}
      <form className="authPasswordForm" onSubmit={handleSubmit}>
        {registering ? <input name="displayName" placeholder="Tên hiển thị" /> : null}
        <input name="email" type="email" required autoComplete="email" placeholder="Email" />
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={registering ? "new-password" : "current-password"}
          placeholder="Mật khẩu"
        />
        <button type="submit" className="authButton" disabled={!configured || loading}>
          {loading ? t("authLoading") : registering ? t("signUp") : t("signIn")}
        </button>
      </form>
      <div className="authButtonRow">
        <button
          type="button"
          className="authButton authButtonSecondary"
          onClick={() => setRegistering((value) => !value)}
          disabled={!configured || loading}
        >
          {registering ? t("signIn") : t("signUp")}
        </button>
        {onGoogleLogin ? (
          <button type="button" className="authButton authButtonSecondary" onClick={onGoogleLogin}>
            Google
          </button>
        ) : null}
      </div>
    </section>
  );
}
