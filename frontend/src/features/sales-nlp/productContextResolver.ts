import type { CatalogProduct } from "../product-catalog/productCatalogTypes";
import { normalizeText } from "./normalizeText";
import {
  findConfidentCatalogCandidate,
  findExplicitCatalogMatch,
} from "./productMentionResolver";
import type { ProductContextSource } from "./salesNlpTypes";
export type { ProductContextSource } from "./salesNlpTypes";

export type ProductContextInput = {
  comment: string;
  catalog: CatalogProduct[];
  pinnedProductId?: string | null;
  selectedCameraProductId?: string | null;
  latestCameraProductId?: string | null;
};

export type ProductContextResolution = {
  product: CatalogProduct | null;
  source: ProductContextSource;
  confidence: number;
  explanation: string;
  clarificationQuestion: string | null;
  isClarification: boolean;
};

const DEICTIC_PATTERNS: RegExp[] = [
  /\bcai nay\b/,
  /\bmon nay\b/,
  /\bsan pham nay\b/,
  /\bcai dang cam\b/,
  /\bmau nay\b/,
  /\bem nay\b/,
];

const CLARIFICATION_QUESTION =
  "Bạn đang hỏi về sản phẩm nào ạ? Bạn có thể nêu tên sản phẩm hoặc host ghim sản phẩm trên livestream.";

export const PRODUCT_CONTEXT_SOURCE_LABELS: Record<ProductContextSource, string> = {
  camera_context: "Camera context",
  pinned_product: "Pinned product",
  catalog_match: "Catalog match",
  clarification: "Clarification",
};

function findProductById(catalog: CatalogProduct[], productId: string | null | undefined) {
  if (!productId) {
    return null;
  }
  return catalog.find((product) => product.id === productId) ?? null;
}

export function hasDeicticProductReference(comment: string): boolean {
  const text = normalizeText(comment);
  return DEICTIC_PATTERNS.some((pattern) => pattern.test(text));
}

function resolveCameraProduct(input: ProductContextInput): CatalogProduct | null {
  const cameraProductId = input.selectedCameraProductId ?? input.latestCameraProductId;
  return findProductById(input.catalog, cameraProductId);
}

function buildResolution(
  product: CatalogProduct | null,
  source: ProductContextSource,
  confidence: number,
  explanation: string,
  isClarification = false,
): ProductContextResolution {
  return {
    product,
    source,
    confidence,
    explanation,
    clarificationQuestion: isClarification ? CLARIFICATION_QUESTION : null,
    isClarification,
  };
}

export function resolveProductContext(input: ProductContextInput): ProductContextResolution {
  const explicitMatch = findExplicitCatalogMatch(input.comment, input.catalog);
  if (explicitMatch) {
    return buildResolution(
      explicitMatch.product,
      "catalog_match",
      Math.min(0.98, 0.82 + explicitMatch.score * 0.03),
      `Explicit catalog match via ${explicitMatch.matchedTerms.join(", ") || "product terms"}.`,
    );
  }

  if (hasDeicticProductReference(input.comment)) {
    const cameraProduct = resolveCameraProduct(input);
    if (cameraProduct) {
      return buildResolution(
        cameraProduct,
        "camera_context",
        0.88,
        `Deictic reference resolved to camera product "${cameraProduct.name}".`,
      );
    }

    const pinnedProduct = findProductById(input.catalog, input.pinnedProductId);
    if (pinnedProduct) {
      return buildResolution(
        pinnedProduct,
        "pinned_product",
        0.72,
        `Deictic reference resolved to pinned product "${pinnedProduct.name}" (no camera product).`,
      );
    }

    return buildResolution(
      null,
      "clarification",
      0.35,
      "Deictic reference without camera or pinned product context.",
      true,
    );
  }

  const pinnedProduct = findProductById(input.catalog, input.pinnedProductId);
  if (pinnedProduct) {
    return buildResolution(
      pinnedProduct,
      "pinned_product",
      0.65,
      `No explicit product mention; using pinned product "${pinnedProduct.name}".`,
    );
  }

  const catalogCandidate = findConfidentCatalogCandidate(input.comment, input.catalog);
  if (catalogCandidate) {
    return buildResolution(
      catalogCandidate.product,
      "catalog_match",
      Math.min(0.9, 0.7 + catalogCandidate.score * 0.04),
      `Catalog candidate "${catalogCandidate.product.name}" above confidence threshold.`,
    );
  }

  return buildResolution(
    null,
    "clarification",
    0.35,
    "No product context and no confident catalog match.",
    true,
  );
}
