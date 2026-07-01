import { fetchNlpHealth } from "./nlpIntent";
import { getApiBaseUrl } from "./config";

export type BackendHealthStatus = "ok" | "unavailable" | "checking";

export type ServiceHealthSnapshot = {
  backend: BackendHealthStatus;
  mlOptional: "ok" | "unavailable" | "unknown" | "checking";
  apiBaseUrl: string;
};

const HEALTH_TIMEOUT_MS = 15_000;

export async function fetchBackendHealth(): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(`${getApiBaseUrl()}/api/health`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      return false;
    }
    const payload = (await response.json()) as { status?: string };
    return payload.status === "ok";
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function fetchServiceHealthSnapshot(): Promise<ServiceHealthSnapshot> {
  const apiBaseUrl = getApiBaseUrl();
  const backendOk = await fetchBackendHealth();
  if (!backendOk) {
    return {
      backend: "unavailable",
      mlOptional: "unknown",
      apiBaseUrl,
    };
  }

  const nlpHealth = await fetchNlpHealth();
  const mlOptional =
    nlpHealth?.ml_service_status === "ok"
      ? "ok"
      : nlpHealth
        ? "unavailable"
        : "unknown";

  return {
    backend: "ok",
    mlOptional,
    apiBaseUrl,
  };
}
