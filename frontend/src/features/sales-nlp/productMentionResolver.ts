import type { CatalogProduct, ProductCategory } from "../product-catalog/productCatalogTypes";
import type { ProductContextSource } from "./salesNlpTypes";
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
  contextSource?: ProductContextSource;
  explanation?: string;
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

const GENERIC_FAMILY_TERMS = new Set(
  [...Object.values(CATEGORY_KEYWORDS).flat(), "son", "kinh", "ao", "tui", "mu", "makeup"].map(
    normalizeToken,
  ),
);

const WEAK_PRODUCT_FAMILY_TAGS = new Set(
  [
    "son matte",
    "son mini",
    "son velvet",
    "son do",
    "son cam",
    "son ruby",
    "son hong dat",
    "son do dam",
  ].map(normalizeToken),
);

function isFamilyAmbiguityTerm(term: string): boolean {
  if (GENERIC_FAMILY_TERMS.has(term)) {
    return false;
  }
  if (term.length >= 8) {
    return true;
  }
  return term.split(" ").filter(Boolean).length >= 2 && term.length >= 6;
}

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

export function detectMentionedCategories(text: string): ProductCategory[] {
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

export function buildCategoryListClarification(
  category: ProductCategory,
  categoryProducts: CatalogProduct[],
): string {
  const categoryLabel =
    category === "lipstick" ? "son" : category === "glasses" ? "kính" : category === "fashion" ? "áo" : "sản phẩm";
  if (categoryProducts.length >= 2) {
    const names = categoryProducts
      .slice(0, 5)
      .map((product) => product.name)
      .join(", ");
    return `Shop đang có các mẫu ${categoryLabel}: ${names}. Bạn muốn hỏi mẫu nào ạ?`;
  }
  if (categoryProducts.length === 1) {
    return `Shop đang có ${categoryProducts[0].name}. Bạn muốn hỏi giá, màu hay còn hàng ạ?`;
  }
  return `Shop có nhiều loại ${categoryLabel} trong catalog. Bạn có thể nêu tên hoặc màu cụ thể ạ?`;
}

export function buildNamedOptionsClarification(
  products: CatalogProduct[],
  familyHint?: string,
): string {
  const names = products.slice(0, 3).map((product) => product.name);
  if (names.length === 0) {
    return "Bạn có thể nêu rõ tên sản phẩm bạn muốn hỏi không?";
  }
  if (familyHint) {
    return `Shop có nhiều loại ${familyHint}: ${names.join(", ")}. Bạn muốn hỏi loại nào?`;
  }
  if (names.length === 1) {
    return `Bạn đang hỏi về ${names[0]} ạ? Bạn có thể nêu rõ tên sản phẩm.`;
  }
  if (names.length === 2) {
    return `Bạn đang hỏi về ${names[0]} hay ${names[1]} ạ?`;
  }
  return `Bạn đang hỏi về ${names.slice(0, -1).join(", ")} hay ${names[names.length - 1]} ạ?`;
}

function extractFamilyHintFromProducts(products: CatalogProduct[]): string | undefined {
  if (products.length < 2) {
    return undefined;
  }

  const splitNames = products.map((product) => product.name.split(/\s+/));
  const prefix: string[] = [];
  for (let index = 0; index < splitNames[0].length; index += 1) {
    const word = splitNames[0][index];
    if (splitNames.every((parts) => parts[index] === word)) {
      prefix.push(word);
    } else {
      break;
    }
  }

  return prefix.length >= 2 ? prefix.join(" ") : undefined;
}

function findUniquelyIdentifiedMatch(
  pool: ProductMentionMatch[],
  comment: string,
): ProductMentionMatch | null {
  const text = normalizeText(comment);

  const byFullName = pool.filter((entry) => {
    const name = normalizeToken(entry.product.name);
    return name.length >= 6 && text.includes(name);
  });
  if (byFullName.length === 1) {
    return byFullName[0];
  }

  const byLongTag = pool.filter((entry) =>
    entry.product.tags.some((tag) => {
      const normalized = normalizeToken(tag);
      return (
        normalized.length >= 8 &&
        !WEAK_PRODUCT_FAMILY_TAGS.has(normalized) &&
        text.includes(normalized)
      );
    }),
  );
  if (byLongTag.length === 1) {
    return byLongTag[0];
  }

  for (const entry of pool) {
    const specificTags = entry.product.tags
      .map(normalizeToken)
      .filter(
        (tag) =>
          tag.length >= 8 &&
          !WEAK_PRODUCT_FAMILY_TAGS.has(tag) &&
          text.includes(tag),
      );
    if (specificTags.length === 0) {
      continue;
    }

    const competitors = pool.filter(
      (other) =>
        other.product.id !== entry.product.id &&
        other.product.tags.some((tag) => specificTags.includes(normalizeToken(tag))),
    );
    if (competitors.length === 0) {
      return entry;
    }
  }

  const mentionedCategories = detectMentionedCategories(text);
  for (const category of mentionedCategories) {
    const categoryPool = pool.filter((entry) => entry.product.category === category);
    const colorMatches = categoryPool.filter((entry) =>
      entry.product.colors.some((color) => {
        const normalized = normalizeToken(color);
        return normalized.length >= 3 && text.includes(normalized);
      }),
    );
    if (colorMatches.length === 1) {
      return colorMatches[0];
    }
  }

  return null;
}

export type CatalogMatchResolution =
  | { kind: "single"; match: ProductMentionMatch }
  | {
      kind: "ambiguous";
      candidates: ProductMentionMatch[];
      clarificationQuestion: string;
    }
  | { kind: "none" };

export function isCategoryLevelQuestion(comment: string): boolean {
  const text = normalizeText(comment);
  const categories = detectMentionedCategories(text);
  const tokens = text.split(" ").filter(Boolean);
  if (tokens.includes("ao") && !categories.includes("fashion")) {
    categories.push("fashion");
  }
  if (categories.length === 0) {
    return false;
  }

  if (/\b(co|shop co)\s+(may|bao nhieu|nhung)\s+loai\b/.test(text)) {
    return true;
  }
  if (/\bnhung\s+loai\b.*\bnao\b/.test(text) || /\bloai\s+nao\b/.test(text)) {
    return true;
  }
  if (/\bnao\b.*\b(re nhat|dep nhat|tot nhat|ban chay nhat)\b/.test(text)) {
    return true;
  }
  if (/\b(re nhat|dep nhat|tot nhat|ban chay nhat)\b.*\bnao\b/.test(text)) {
    return true;
  }
  if (/\bnao\b.*\b(con hang|con khong)\b/.test(text)) {
    return true;
  }
  if (/\b(con hang|con khong)\b.*\bnao\b/.test(text)) {
    return true;
  }

  return false;
}

function inferFamilyHintLabel(term: string): string {
  return term
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function findAmbiguousFamilyGroup(
  comment: string,
  ranked: ProductMentionMatch[],
  catalog: CatalogProduct[],
): { familyHint: string; matches: ProductMentionMatch[] } | null {
  const text = normalizeText(comment);
  const termGroups = new Map<string, ProductMentionMatch[]>();

  const registerGroup = (term: string, entry: ProductMentionMatch) => {
    if (!isFamilyAmbiguityTerm(term) || !text.includes(term)) {
      return;
    }
    const group = termGroups.get(term) ?? [];
    if (!group.some((candidate) => candidate.product.id === entry.product.id)) {
      group.push(entry);
      termGroups.set(term, group);
    }
  };

  for (const entry of ranked) {
    for (const term of entry.matchedTerms) {
      registerGroup(term, entry);
    }
    for (const tag of entry.product.tags.map(normalizeToken)) {
      registerGroup(tag, entry);
    }
  }

  const mentionedCategories = detectMentionedCategories(text);
  if (mentionedCategories.includes("lipstick")) {
    const colorTerm = ["do", "cam", "hong dat", "do dam"].find((term) => text.includes(term));
    if (colorTerm && text.includes("son")) {
      const colorMatches = catalog
        .filter(
          (product) =>
            product.category === "lipstick" &&
            (product.colors.some((color) => normalizeToken(color).includes(colorTerm)) ||
              product.tags.some((tag) => normalizeToken(tag).includes(colorTerm))),
        )
        .map((product) => scoreProduct(product, text));
      if (colorMatches.length >= 2) {
        termGroups.set(`son ${colorTerm}`, colorMatches);
      }
    }

    for (const variantTerm of ["matte", "mini", "velvet"]) {
      if (!text.includes(variantTerm) || !text.includes("son")) {
        continue;
      }
      const variantMatches = catalog
        .filter(
          (product) =>
            product.category === "lipstick" &&
            (product.tags.some((tag) => normalizeToken(tag).includes(variantTerm)) ||
              normalizeToken(product.name).includes(variantTerm)),
        )
        .map((product) => scoreProduct(product, text));
      if (variantMatches.length >= 2) {
        termGroups.set(`son ${variantTerm}`, variantMatches);
      }
    }
  }
  const sharedTerms = [...termGroups.entries()]
    .map(([term, matches]) => {
      if (mentionedCategories.length > 0) {
        const inCategory = matches.filter((entry) =>
          mentionedCategories.includes(entry.product.category),
        );
        if (inCategory.length >= 2) {
          return [term, inCategory] as const;
        }
        return null;
      }
      return matches.length >= 2 ? ([term, matches] as const) : null;
    })
    .filter((entry): entry is readonly [string, ProductMentionMatch[]] => entry !== null)
    .sort(
      (left, right) =>
        right[0].length - left[0].length || right[1].length - left[1].length,
    );

  if (sharedTerms.length === 0) {
    return null;
  }

  const [term, matches] = sharedTerms[0];
  const sortedMatches = [...matches].sort(
    (left, right) =>
      right.score - left.score ||
      right.product.stock - left.product.stock ||
      left.product.name.localeCompare(right.product.name, "vi"),
  );

  return {
    familyHint:
      extractFamilyHintFromProducts(sortedMatches.map((entry) => entry.product)) ??
      inferFamilyHintLabel(term),
    matches: sortedMatches,
  };
}

export function resolveCatalogProductMatch(
  comment: string,
  catalog: CatalogProduct[],
): CatalogMatchResolution {
  const ranked = rankProducts(comment, catalog);
  if (ranked.length === 0) {
    return { kind: "none" };
  }

  const uniqueMatch = findUniquelyIdentifiedMatch(ranked, comment);
  if (uniqueMatch) {
    return { kind: "single", match: uniqueMatch };
  }

  const familyGroup = findAmbiguousFamilyGroup(comment, ranked, catalog);
  if (familyGroup && familyGroup.matches.length >= 2) {
    const topFamilyMatches = familyGroup.matches.slice(0, 5);
    return {
      kind: "ambiguous",
      candidates: topFamilyMatches,
      clarificationQuestion: buildNamedOptionsClarification(
        topFamilyMatches.map((entry) => entry.product),
        familyGroup.familyHint,
      ),
    };
  }

  const explicitMatches = ranked.filter((entry) => isExplicitProductMention(entry, comment));
  const bestExplicit = pickBestFromMatches(explicitMatches);
  if (bestExplicit) {
    const closeExplicit = explicitMatches.filter((entry) => areScoresClose(bestExplicit, entry));
    if (closeExplicit.length > 1) {
      const familyHint = extractFamilyHintFromProducts(
        closeExplicit.map((entry) => entry.product),
      );
      return {
        kind: "ambiguous",
        candidates: closeExplicit.slice(0, 5),
        clarificationQuestion: buildNamedOptionsClarification(
          closeExplicit.map((entry) => entry.product),
          familyHint,
        ),
      };
    }
    return { kind: "single", match: bestExplicit };
  }

  const best = pickBestFromMatches(ranked);
  if (!best || best.score < 3) {
    return { kind: "none" };
  }

  const closeMatches = ranked.filter((entry) => areScoresClose(best, entry));
  if (closeMatches.length > 1) {
    const familyHint = extractFamilyHintFromProducts(closeMatches.map((entry) => entry.product));
    return {
      kind: "ambiguous",
      candidates: closeMatches.slice(0, 5),
      clarificationQuestion: buildNamedOptionsClarification(
        closeMatches.map((entry) => entry.product),
        familyHint,
      ),
    };
  }

  return { kind: "single", match: best };
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

function isExplicitProductMention(match: ProductMentionMatch, comment: string): boolean {
  const text = normalizeText(comment);
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

  const matchedProductColor = match.product.colors
    .map(normalizeToken)
    .find((color) => color && containsTerm(text, color));
  if (matchedProductColor) {
    const categoryKeywords = CATEGORY_KEYWORDS[match.product.category] ?? [];
    const hasCategoryHint = categoryKeywords.some((keyword) => containsTerm(text, keyword));
    const hasShortCategoryToken =
      match.product.category === "fashion" && containsTerm(text, "ao");
    if (hasCategoryHint || hasShortCategoryToken) {
      return true;
    }
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

export function findExplicitCatalogMatch(
  comment: string,
  catalog: CatalogProduct[],
): ProductMentionMatch | null {
  const resolution = resolveCatalogProductMatch(comment, catalog);
  return resolution.kind === "single" ? resolution.match : null;
}

export function findConfidentCatalogCandidate(
  comment: string,
  catalog: CatalogProduct[],
  minimumScore = 3,
): ProductMentionMatch | null {
  const resolution = resolveCatalogProductMatch(comment, catalog);
  if (resolution.kind !== "single" || resolution.match.score < minimumScore) {
    return null;
  }
  return resolution.match;
}

export function resolveProductSelection(
  comment: string,
  catalog: CatalogProduct[],
  pinnedProduct: CatalogProduct,
): ProductResolution {
  const text = normalizeText(comment);
  const ranked = rankProducts(comment, catalog);
  const mentionedCategories = detectMentionedCategories(text);
  const explicitBest = pickBestFromMatches(
    ranked.filter((entry) => isExplicitProductMention(entry, comment)),
  );

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

export function rankProductMentions(
  comment: string,
  catalog: CatalogProduct[],
  limit = 5,
): ProductMentionMatch[] {
  return rankProducts(comment, catalog).slice(0, limit);
}
