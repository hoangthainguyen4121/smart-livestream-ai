import { useEffect, useState } from "react";

import {
  fetchServiceHealthSnapshot,
  type ServiceHealthSnapshot,
} from "../api/systemHealth";

const REFRESH_INTERVAL_MS = 30_000;

export function ServiceHealthBanner() {
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
        <strong>Backend chưa sẵn sàng.</strong> Không thể kết nối{" "}
        <code>{health.apiBaseUrl}</code>. Chat, đăng ký khuôn mặt và AI Event Feed sẽ không hoạt
        động. Browser AR vẫn chạy cục bộ. Chạy{" "}
        <code>docker compose up --build</code> hoặc{" "}
        <code>.\scripts\start-backend.ps1</code>.
      </div>
    );
  }

  if (health.mlOptional === "unavailable") {
    return (
      <div className="serviceHealthBanner serviceHealthBanner--warning" role="status">
        <strong>PhoBERT ML service (tuỳ chọn) chưa chạy.</strong> Phân loại ý định dùng{" "}
        <em>rules fallback</em>. Khởi động ML API từ repo{" "}
        <code>smart-livestream-ml</code> cổng 8010 — xem{" "}
        <code>docs/phobert_bridge_demo.md</code>.
      </div>
    );
  }

  return null;
}
