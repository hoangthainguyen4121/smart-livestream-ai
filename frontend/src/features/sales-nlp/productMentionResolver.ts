import type { CatalogProduct, ProductCategory } from "../product-catalog/productCatalogTypes";
import {
  buildSearchDiagnostics,
  isSemanticSearchMatch,
  searchProducts,
  shouldUseSemanticSearch,
} from "../product-search/productSearch";
import type { ProductSearchDiagnostics } from "../product-search/productSearchTypes";
import { normalizeText, normalizeToken } from "./normalizeText";

export type ProductResolutionSource =
  | "mentioned_product"
  | "semantic_search"
  | "pinned_product"
  | "category_match"
  | "ambiguous"
  | "none";

export type ProductMentionMatch = {
  product: CatalogProduct;
  score: number;
  matchedTerms: string[];
};

export type ProductResolution = {
  selectedProduct: CatalogProduct;
  selectedProductId: string;
  resolutionSource: ProductResolutionSource;
  matchedProducts: CatalogProduct[];
  productConfidence: number;
  semanticSimilarity: number | null;
  searchDiagnostics: ProductSearchDiagnostics | null;
  isAmbiguous: boolean;
  matchedTerms: string[];
  clarificationQuestion: string | null;
};

const CATEGORY_KEYWORDS: Record<ProductCategory, string[]> = {
  glasses: ["kinh", "mat kinh", "glasses"],
  lipstick: ["son", "son moi", "lipstick"],
  accessory: ["phu kien", "vuong mien", "crown", "mu bucket", "mu"],
  skincare: ["kem chong nang", "skincare", "spf", "chong nang"],
  electronics: ["tai nghe", "bluetooth", "headphones"],
  fashion: ["ao thun", "tui deo cheo", "oversize", "thun"],
};

const SCORE_CLOSE_THRESHOLD = 1;

function tokenize(text: string): string[] {
  return text.split(" ").filter(Boolean);
}

function containsTerm(text: string, term: string): boolean {
  if (!term) {
    return false;
  }
  if (term.length <= 4) {
    return tokenize(text).includes(term);
  }
  return text.includes(term);
}

function detectMentionedCategories(text: string): ProductCategory[] {
  const categories: ProductCategory[] = [];
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as Array<
    [ProductCategory, string[]]
  >) {
    if (keywords.some((keyword) => containsTerm(text, keyword))) {
      categories.push(category);
    }
  }
  return categories;
}

function scoreProduct(product: CatalogProduct, text: string): ProductMentionMatch {
  const terms = [
    normalizeToken(product.name),
    normalizeToken(product.id.replace(/-/g, " ")),
    ...product.tags.map(normalizeToken),
    ...product.colors.map(normalizeToken),
    ...(CATEGORY_KEYWORDS[product.category] ?? []),
  ];

  const matchedTerms: string[] = [];
  let score = 0;

  for (const term of terms) {
    if (!term || term.length < 2) {
      continue;
    }
    if (!containsTerm(text, term)) {
      continue;
    }
    matchedTerms.push(term);
    if (term === normalizeToken(product.name)) {
      score += 5;
    } else if (term.length >= 8) {
      score += 3;
    } else if (term.length >= 4) {
      score += 2;
    } else {
      score += 1;
    }
  }

  for (const keyword of CATEGORY_KEYWORDS[product.category] ?? []) {
    if (containsTerm(text, keyword) && !matchedTerms.includes(keyword)) {
      matchedTerms.push(keyword);
      score += 2;
    }
  }

  return { product, score, matchedTerms: [...new Set(matchedTerms)] };
}

function rankProducts(comment: string, catalog: CatalogProduct[]): ProductMentionMatch[] {
  const text = normalizeText(comment);
  return catalog
    .map((product) => scoreProduct(product, text))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);
}

function pickBestFromMatches(matches: ProductMentionMatch[]): ProductMentionMatch | null {
  if (matches.length === 0) {
    return null;
  }

  return [...matches].sort(
    (left, right) =>
      right.score - left.score ||
      right.product.stock - left.product.stock ||
      left.product.name.localeCompare(right.product.name, "vi"),
  )[0];
}

function areScoresClose(left: ProductMentionMatch, right: ProductMentionMatch): boolean {
  return Math.abs(left.score - right.score) <= SCORE_CLOSE_THRESHOLD;
}

function buildCategoryClarification(category: ProductCategory): string {
  switch (category) {
    case "lipstick":
      return "Bạn đang hỏi mẫu son nào ạ?";
    case "glasses":
      return "Bạn đang hỏi mẫu kính nào ạ?";
    default:
      return "Bạn có thể nêu rõ sản phẩm bạn muốn hỏi không?";
  }
}

function computeProductConfidence(
  source: ProductResolutionSource,
  topScore: number,
  secondScore: number,
): number {
  switch (source) {
    case "mentioned_product":
      return Math.min(0.98, 0.82 + topScore * 0.03);
    case "semantic_search":
      return Math.min(0.95, 0.78 + topScore * 0.15);
    case "category_match":
      return Math.min(0.92, 0.72 + topScore * 0.03);
    case "pinned_product":
      return 0.65;
    case "ambiguous":
      return Math.min(0.75, 0.55 + topScore * 0.02);
    default:
      return 0.5;
  }
}

function isExplicitProductMention(match: ProductMentionMatch): boolean {
  const productName = normalizeToken(match.product.name);
  if (match.matchedTerms.includes(productName)) {
    return true;
  }

  const specificTags = match.product.tags
    .map(normalizeToken)
    .filter((tag) => tag.length >= 5);
  if (specificTags.some((tag) => match.matchedTerms.includes(tag))) {
    return true;
  }

  return match.score >= 5;
}

function buildSemanticResolution(
  comment: string,
  catalog: CatalogProduct[],
): ProductResolution | null {
  const semanticResults = searchProducts(comment, catalog);
  const topMatch = semanticResults[0];
  if (!isSemanticSearchMatch(topMatch)) {
    return null;
  }

  const secondMatch = semanticResults[1];
  const diagnostics = buildSearchDiagnostics(comment, semanticResults);
  const isAmbiguous =
    Boolean(secondMatch) &&
    topMatch.product.category === secondMatch?.product.category &&
    Math.abs(topMatch.similarity - secondMatch.similarity) <= 0.04;

  return {
    selectedProduct: topMatch.product,
    selectedProductId: topMatch.product.id,
    resolutionSource: isAmbiguous ? "ambiguous" : "semantic_search",
    matchedProducts: semanticResults.slice(0, 3).map((entry) => entry.product),
    productConfidence: computeProductConfidence(
      isAmbiguous ? "ambiguous" : "semantic_search",
      topMatch.similarity,
      secondMatch?.similarity ?? 0,
    ),
    semanticSimilarity: topMatch.similarity,
    searchDiagnostics: diagnostics,
    isAmbiguous,
    matchedTerms: topMatch.matchReasons,
    clarificationQuestion: isAmbiguous
      ? buildCategoryClarification(topMatch.product.category)
      : null,
  };
}

export function resolveProductSelection(
  comment: string,
  catalog: CatalogProduct[],
  pinnedProduct: CatalogProduct,
): ProductResolution {
  const text = normalizeText(comment);
  const ranked = rankProducts(comment, catalog);
  const mentionedCategories = detectMentionedCategories(text);
  const explicitBest = pickBestFromMatches(ranked.filter(isExplicitProductMention));

  if (explicitBest) {
    const second = ranked.find(
      (entry) =>
        entry.product.id !== explicitBest.product.id && areScoresClose(explicitBest, entry),
    );
    if (second && explicitBest.product.category === second.product.category) {
      const pinnedCandidate = ranked.find((entry) => entry.product.id === pinnedProduct.id);
      if (pinnedCandidate && pinnedCandidate.product.category === explicitBest.product.category) {
        return {
          selectedProduct: pinnedCandidate.product,
          selectedProductId: pinnedCandidate.product.id,
          resolutionSource: "mentioned_product",
          matchedProducts: ranked.slice(0, 3).map((entry) => entry.product),
          productConfidence: computeProductConfidence(
            "mentioned_product",
            pinnedCandidate.score,
            second.score,
          ),
          semanticSimilarity: null,
          searchDiagnostics: null,
          isAmbiguous: false,
          matchedTerms: pinnedCandidate.matchedTerms,
          clarificationQuestion: null,
        };
      }
    }

    return {
      selectedProduct: explicitBest.product,
      selectedProductId: explicitBest.product.id,
      resolutionSource: "mentioned_product",
      matchedProducts: ranked.slice(0, 3).map((entry) => entry.product),
      productConfidence: computeProductConfidence(
        "mentioned_product",
        explicitBest.score,
        second?.score ?? 0,
      ),
      semanticSimilarity: null,
      searchDiagnostics: null,
      isAmbiguous: false,
      matchedTerms: explicitBest.matchedTerms,
      clarificationQuestion: null,
    };
  }

  if (shouldUseSemanticSearch(comment, mentionedCategories)) {
    const semanticResolution = buildSemanticResolution(comment, catalog);
    if (semanticResolution) {
      return semanticResolution;
    }
  }

  if (ranked.length === 0 && mentionedCategories.length === 0) {
    return {
      selectedProduct: pinnedProduct,
      selectedProductId: pinnedProduct.id,
      resolutionSource: "pinned_product",
      matchedProducts: [pinnedProduct],
      productConfidence: computeProductConfidence("pinned_product", 0, 0),
      semanticSimilarity: null,
      searchDiagnostics: null,
      isAmbiguous: false,
      matchedTerms: ["pinned fallback"],
      clarificationQuestion: null,
    };
  }

  if (ranked.length >= 2 && areScoresClose(ranked[0], ranked[1])) {
    const sameCategory = ranked[0].product.category === ranked[1].product.category;
    const pinnedCandidate = ranked.find((entry) => entry.product.id === pinnedProduct.id);
    if (pinnedCandidate && sameCategory) {
      return {
        selectedProduct: pinnedCandidate.product,
        selectedProductId: pinnedCandidate.product.id,
        resolutionSource:
          pinnedProduct.category === ranked[0].product.category
            ? "category_match"
            : "mentioned_product",
        matchedProducts: ranked.slice(0, 3).map((entry) => entry.product),
        productConfidence: computeProductConfidence(
          "category_match",
          pinnedCandidate.score,
          ranked[1].score,
        ),
        semanticSimilarity: null,
        searchDiagnostics: null,
        isAmbiguous: false,
        matchedTerms: pinnedCandidate.matchedTerms,
        clarificationQuestion: null,
      };
    }
  }

  if (mentionedCategories.length > 0) {
    const category = mentionedCategories[0];
    const categoryMatches = ranked.filter((entry) => entry.product.category === category);

    if (categoryMatches.length > 0) {
      if (pinnedProduct.category === category) {
        const pinnedMatch = categoryMatches.find(
          (entry) => entry.product.id === pinnedProduct.id,
        );
        if (pinnedMatch) {
          return {
            selectedProduct: pinnedProduct,
            selectedProductId: pinnedProduct.id,
            resolutionSource: "category_match",
            matchedProducts: categoryMatches.slice(0, 3).map((entry) => entry.product),
            productConfidence: computeProductConfidence(
              "category_match",
              pinnedMatch.score,
              categoryMatches[1]?.score ?? 0,
            ),
            semanticSimilarity: null,
            searchDiagnostics: null,
            isAmbiguous: false,
            matchedTerms: pinnedMatch.matchedTerms,
            clarificationQuestion: null,
          };
        }
      }

      const best = pickBestFromMatches(categoryMatches);
      if (best) {
        const closeMatches = categoryMatches.filter((entry) => areScoresClose(best, entry));
        if (closeMatches.length > 1) {
          const tiedBest = pickBestFromMatches(closeMatches);
          if (
            tiedBest &&
            closeMatches.every(
              (entry) =>
                entry.score === tiedBest.score && entry.product.stock === tiedBest.product.stock,
            )
          ) {
            return {
              selectedProduct: tiedBest.product,
              selectedProductId: tiedBest.product.id,
              resolutionSource: "ambiguous",
              matchedProducts: closeMatches.map((entry) => entry.product),
              productConfidence: computeProductConfidence(
                "ambiguous",
                tiedBest.score,
                tiedBest.score,
              ),
              semanticSimilarity: null,
              searchDiagnostics: null,
              isAmbiguous: true,
              matchedTerms: tiedBest.matchedTerms,
              clarificationQuestion: buildCategoryClarification(category),
            };
          }
        }

        const hasSpecificNameMatch = best.matchedTerms.some(
          (term) =>
            term === normalizeToken(best.product.name) ||
            best.product.tags.map(normalizeToken).includes(term),
        );

        return {
          selectedProduct: best.product,
          selectedProductId: best.product.id,
          resolutionSource: hasSpecificNameMatch ? "mentioned_product" : "category_match",
          matchedProducts: categoryMatches.slice(0, 3).map((entry) => entry.product),
          productConfidence: computeProductConfidence(
            hasSpecificNameMatch ? "mentioned_product" : "category_match",
            best.score,
            categoryMatches[1]?.score ?? 0,
          ),
          semanticSimilarity: null,
          searchDiagnostics: null,
          isAmbiguous: false,
          matchedTerms: best.matchedTerms,
          clarificationQuestion: null,
        };
      }
    }
  }

  const bestOverall = pickBestFromMatches(ranked);
  if (bestOverall) {
    const second = ranked[1];
    const source: ProductResolutionSource =
      bestOverall.matchedTerms.includes(normalizeToken(bestOverall.product.name)) ||
      bestOverall.score >= 4
        ? "mentioned_product"
        : "category_match";

    if (second && areScoresClose(bestOverall, second)) {
      return {
        selectedProduct: bestOverall.product,
        selectedProductId: bestOverall.product.id,
        resolutionSource: "ambiguous",
        matchedProducts: ranked.slice(0, 3).map((entry) => entry.product),
        productConfidence: computeProductConfidence(
          "ambiguous",
          bestOverall.score,
          second.score,
        ),
        semanticSimilarity: null,
        searchDiagnostics: null,
        isAmbiguous: true,
        matchedTerms: bestOverall.matchedTerms,
        clarificationQuestion: buildCategoryClarification(bestOverall.product.category),
      };
    }

    return {
      selectedProduct: bestOverall.product,
      selectedProductId: bestOverall.product.id,
      resolutionSource: source,
      matchedProducts: ranked.slice(0, 3).map((entry) => entry.product),
      productConfidence: computeProductConfidence(source, bestOverall.score, second?.score ?? 0),
      semanticSimilarity: null,
      searchDiagnostics: null,
      isAmbiguous: false,
      matchedTerms: bestOverall.matchedTerms,
      clarificationQuestion: null,
    };
  }

  return {
    selectedProduct: pinnedProduct,
    selectedProductId: pinnedProduct.id,
    resolutionSource: "pinned_product",
    matchedProducts: [pinnedProduct],
    productConfidence: computeProductConfidence("pinned_product", 0, 0),
    semanticSimilarity: null,
    searchDiagnostics: null,
    isAmbiguous: false,
    matchedTerms: ["pinned fallback"],
    clarificationQuestion: null,
  };
}

export function resolveMentionedProducts(
  comment: string,
  catalog: CatalogProduct[],
  pinnedProduct: CatalogProduct,
): ProductMentionMatch[] {
  const ranked = rankProducts(comment, catalog);
  if (ranked.length === 0) {
    return [{ product: pinnedProduct, score: 0, matchedTerms: ["pinned fallback"] }];
  }
  return ranked;
}

export function resolvePrimaryProduct(
  comment: string,
  catalog: CatalogProduct[],
  pinnedProduct: CatalogProduct,
): ProductMentionMatch {
  const resolution = resolveProductSelection(comment, catalog, pinnedProduct);
  return {
    product: resolution.selectedProduct,
    score: Math.round(resolution.productConfidence * 10),
    matchedTerms: resolution.matchedTerms,
  };
}

export function resolveComparedProducts(
  comment: string,
  catalog: CatalogProduct[],
  pinnedProduct: CatalogProduct,
): CatalogProduct[] {
  const text = normalizeText(comment);
  const ranked = rankProducts(comment, catalog).filter((entry) => entry.score > 0);
  const categories = detectMentionedCategories(text);

  if (categories.length >= 2) {
    const picks: CatalogProduct[] = [];
    for (const category of categories) {
      const bestInCategory = ranked.find((entry) => entry.product.category === category);
      if (bestInCategory) {
        picks.push(bestInCategory.product);
      }
    }
    if (picks.length >= 2) {
      return picks.slice(0, 2);
    }
  }

  if (ranked.length >= 2) {
    const distinctCategories = new Set(ranked.map((entry) => entry.product.category));
    if (distinctCategories.size >= 2) {
      const first = ranked[0].product;
      const second =
        ranked.find((entry) => entry.product.category !== first.category)?.product ?? null;
      if (second) {
        return [first, second];
      }
    }
    return [ranked[0].product, ranked[1].product];
  }

  if (/\bkinh\b/.test(text) && /\bson\b/.test(text)) {
    const glasses = catalog.find((product) => product.category === "glasses");
    const lipstick = catalog.find((product) => product.category === "lipstick");
    if (glasses && lipstick) {
      return [glasses, lipstick];
    }
  }

  void pinnedProduct;
  return [];
}
