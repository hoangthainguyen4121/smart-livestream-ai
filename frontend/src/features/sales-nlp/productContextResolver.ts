import type { CatalogProduct } from "../product-catalog/productCatalogTypes";
import { MIN_CAMERA_VISION_CONFIDENCE } from "../camera-product-recognition/types";
import { normalizeText } from "./normalizeText";
import {
  buildCategoryListClarification,
  isCategoryLevelQuestion,
  resolveCatalogProductMatch,
} from "./productMentionResolver";
import {
  hasDeicticProductReference,
  isBarePriceQuery,
  isCategoryListingQuestion,
  isPinnedProductReference,
  isSingleCategoryTokenOnly,
  tokenMentionsCategory,
} from "./intentSignals";
import type { ProductContextSource } from "./salesNlpTypes";
export type { ProductContextSource } from "./salesNlpTypes";
export { hasDeicticProductReference } from "./intentSignals";

export type ProductContextInput = {
  comment: string;
  catalog: CatalogProduct[];
  pinnedProductId?: string | null;
  selectedCameraProductId?: string | null;
  latestCameraProductId?: string | null;
  detectedCameraProductId?: string | null;
  detectedCameraConfidence?: number | null;
  minimumVisionConfidence?: number;
};

export type ProductContextResolution = {
  product: CatalogProduct | null;
  source: ProductContextSource;
  confidence: number;
  explanation: string;
  clarificationQuestion: string | null;
  isClarification: boolean;
};

const CLARIFICATION_QUESTION =
  "Bạn đang hỏi về sản phẩm nào ạ? Bạn có thể nêu tên sản phẩm hoặc host ghim sản phẩm trên livestream.";

export const PRODUCT_CONTEXT_SOURCE_LABELS: Record<ProductContextSource, string> = {  camera_vision: "Camera vision",
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

type ImplicitContextResolution = {  product: CatalogProduct;
  source: Extract<ProductContextSource, "camera_vision" | "camera_context" | "pinned_product">;
  confidence: number;
  explanation: string;
};

function resolveCameraVisionContext(
  input: ProductContextInput,
): ImplicitContextResolution | null {
  const minimumVisionConfidence = input.minimumVisionConfidence ?? MIN_CAMERA_VISION_CONFIDENCE;
  const visionProduct = findProductById(input.catalog, input.detectedCameraProductId);
  const visionConfidence = input.detectedCameraConfidence ?? 0;

  if (visionProduct && visionConfidence >= minimumVisionConfidence) {
    return {
      product: visionProduct,
      source: "camera_vision",
      confidence: visionConfidence,
      explanation: `Camera vision detected "${visionProduct.name}" (${visionConfidence.toFixed(2)} confidence).`,
    };
  }

  return null;
}

function resolveManualCameraContext(
  input: ProductContextInput,
): ImplicitContextResolution | null {
  const manualCameraProduct = findProductById(
    input.catalog,
    input.selectedCameraProductId ?? input.latestCameraProductId,
  );
  if (manualCameraProduct) {
    return {
      product: manualCameraProduct,
      source: "camera_context",
      confidence: 0.88,
      explanation: `Manual camera context set to "${manualCameraProduct.name}".`,
    };
  }

  return null;
}

function resolvePinnedContext(input: ProductContextInput): ImplicitContextResolution | null {
  const pinnedProduct = findProductById(input.catalog, input.pinnedProductId);
  if (pinnedProduct) {
    return {
      product: pinnedProduct,
      source: "pinned_product",
      confidence: 0.65,
      explanation: `Using pinned product "${pinnedProduct.name}".`,
    };
  }

  return null;
}

function resolveDeicticImplicitContext(
  input: ProductContextInput,
): ImplicitContextResolution | null {
  return (
    resolveCameraVisionContext(input) ??
    resolveManualCameraContext(input) ??
    resolvePinnedContext(input)
  );
}

function resolveNonDeicticImplicitContext(
  input: ProductContextInput,
): ImplicitContextResolution | null {
  return resolveCameraVisionContext(input) ?? resolveManualCameraContext(input);
}

function buildResolution(
  product: CatalogProduct | null,
  source: ProductContextSource,
  confidence: number,
  explanation: string,
  isClarification = false,
  clarificationQuestion: string | null = null,
): ProductContextResolution {
  return {
    product,
    source,
    confidence,
    explanation,
    clarificationQuestion: isClarification
      ? (clarificationQuestion ?? CLARIFICATION_QUESTION)
      : null,
    isClarification,
  };
}

function resolveCategoryLevelQuestion(
  input: ProductContextInput,
): ProductContextResolution | null {
  const singleCategory = isSingleCategoryTokenOnly(input.comment);
  const isListing = isCategoryListingQuestion(input.comment);
  const isLevel = isCategoryLevelQuestion(input.comment);

  if (!singleCategory && !isListing && !isLevel) {
    return null;
  }

  const categories = tokenMentionsCategory(normalizeText(input.comment));
  const category = singleCategory ?? categories[0];
  const categoryProducts = category
    ? input.catalog.filter((product) => product.category === category)
    : [];

  return buildResolution(
    null,
    "clarification",
    0.42,
    "Category-level question without a specific product mention.",
    true,
    category
      ? buildCategoryListClarification(category, categoryProducts)
      : CLARIFICATION_QUESTION,
  );
}

function resolvePinnedReferenceQuestion(
  input: ProductContextInput,
): ProductContextResolution | null {
  if (!isPinnedProductReference(input.comment)) {
    return null;
  }

  const pinned = resolvePinnedContext(input);
  if (!pinned) {
    return buildResolution(
      null,
      "clarification",
      0.35,
      "Pinned product reference without an active pinned product.",
      true,
    );
  }

  return buildResolution(
    pinned.product,
    pinned.source,
    pinned.confidence,
    pinned.explanation,
  );
}

export function resolveProductContext(input: ProductContextInput): ProductContextResolution {
  const categoryResolution = resolveCategoryLevelQuestion(input);
  if (categoryResolution) {
    return categoryResolution;
  }

  const pinnedReference = resolvePinnedReferenceQuestion(input);
  if (pinnedReference) {
    return pinnedReference;
  }

  const catalogMatch = resolveCatalogProductMatch(input.comment, input.catalog);
  if (catalogMatch.kind === "single") {
    return buildResolution(
      catalogMatch.match.product,
      "catalog_match",
      Math.min(0.98, 0.82 + catalogMatch.match.score * 0.03),
      `Explicit catalog match via ${catalogMatch.match.matchedTerms.join(", ") || "product terms"}.`,
    );
  }

  if (catalogMatch.kind === "ambiguous") {
    return buildResolution(
      null,
      "clarification",
      0.45,
      `Multiple catalog candidates matched: ${catalogMatch.candidates
        .slice(0, 3)
        .map((entry) => entry.product.name)
        .join(", ")}.`,
      true,
      catalogMatch.clarificationQuestion,
    );
  }

  if (isBarePriceQuery(input.comment)) {
    const pinned = resolvePinnedContext(input);
    if (pinned) {
      return buildResolution(
        pinned.product,
        pinned.source,
        pinned.confidence,
        pinned.explanation,
      );
    }
    return buildResolution(
      null,
      "clarification",
      0.35,
      "Bare price question without pinned or catalog product context.",
      true,
    );
  }

  const isDeictic = hasDeicticProductReference(input.comment);
  const implicitContext = isDeictic
    ? resolveDeicticImplicitContext(input)
    : resolveNonDeicticImplicitContext(input);

  if (isDeictic) {
    if (implicitContext) {
      return buildResolution(
        implicitContext.product,
        implicitContext.source,
        implicitContext.confidence,
        implicitContext.explanation,
      );
    }

    return buildResolution(
      null,
      "clarification",
      0.35,
      "Deictic reference without camera, vision, or pinned product context.",
      true,
    );
  }

  if (implicitContext) {
    return buildResolution(
      implicitContext.product,
      implicitContext.source,
      implicitContext.confidence,
      implicitContext.explanation,
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
