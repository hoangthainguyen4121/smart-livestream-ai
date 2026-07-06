import { getApiBaseUrl } from "../../api/config";
import type { CatalogRasterItem } from "./catalogRasterizer";

export type ProductVisionStatus = {
  enabled: boolean;
  catalogIndexed: number;
  embedder: "clip" | "fingerprint";
};

export type HandHeldVisionMatch = {
  productId: string;
  productName: string;
  score: number;
  confidence: number;
  source: "hand_held_vision";
  embedder: "clip" | "fingerprint";
  explanation: string;
};

export async function fetchProductVisionStatus(): Promise<ProductVisionStatus | null> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/product-vision/status`);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as ProductVisionStatus;
  } catch {
    return null;
  }
}

export async function syncCatalogEmbeddings(items: CatalogRasterItem[]): Promise<ProductVisionStatus | null> {
  const response = await fetch(`${getApiBaseUrl()}/api/product-vision/sync-catalog`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });

  if (!response.ok) {
    throw new Error(`Catalog sync failed (${response.status}).`);
  }

  const payload = (await response.json()) as {
    indexed: number;
    embedder: "clip" | "fingerprint";
  };

  return {
    enabled: true,
    catalogIndexed: payload.indexed,
    embedder: payload.embedder,
  };
}

export async function matchHandCropEmbedding(
  cropImageBase64: string,
): Promise<HandHeldVisionMatch | null> {
  const response = await fetch(`${getApiBaseUrl()}/api/product-vision/match-hand-crop`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cropImageBase64 }),
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Hand crop match failed (${response.status}).`);
  }

  const payload = (await response.json()) as HandHeldVisionMatch;
  return {
    ...payload,
    source: "hand_held_vision",
  };
}
