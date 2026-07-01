const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000";

export function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  return configured || DEFAULT_API_BASE_URL;
}

export function getBackendVideoFeedUrl(): string {
  return `${getApiBaseUrl()}/video-feed`;
}

export function getWebSocketBaseUrl(): string {
  const explicitWs = import.meta.env.VITE_WS_BASE_URL?.trim();
  if (explicitWs) {
    return explicitWs.replace(/\/$/, "");
  }

  const httpBase = getApiBaseUrl();
  if (httpBase.startsWith("https://")) {
    return `wss://${httpBase.slice("https://".length)}`;
  }
  if (httpBase.startsWith("http://")) {
    return `ws://${httpBase.slice("http://".length)}`;
  }

  return `ws://${httpBase}`;
}
