import { useEffect, useState } from "react";

import {
  fetchServiceHealthSnapshot,
  type ServiceHealthSnapshot,
} from "../api/systemHealth";
import { useI18n } from "../i18n/I18nProvider";

const REFRESH_INTERVAL_MS = 30_000;

export function ServiceHealthBanner() {
  const { t } = useI18n();
  const [health, setHealth] = useState<ServiceHealthSnapshot>({
    backend: "checking",
    mlOptional: "checking",
    apiBaseUrl: "",
  });

  useEffect(() => {
    let isMounted = true;

    async function refresh() {
      const snapshot = await fetchServiceHealthSnapshot();
      if (isMounted) {
        setHealth(snapshot);
      }
    }

    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, REFRESH_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(timer);
    };
  }, []);

  if (health.backend === "checking") {
    return null;
  }

  if (health.backend === "unavailable") {
    return (
      <div className="serviceHealthBanner serviceHealthBanner--error" role="alert">
        <strong>{t("backendUnavailable")}</strong>{" "}
        <code>{health.apiBaseUrl}</code>
      </div>
    );
  }

  if (health.mlOptional === "unavailable") {
    return (
      <div className="serviceHealthBanner serviceHealthBanner--warning" role="status">
        <strong>{t("mlUnavailable")}</strong>
      </div>
    );
  }

  return null;
}
