import type { CatalogProduct, ProductCategory } from "../product-catalog/productCatalogTypes";
import { normalizeText } from "../sales-nlp/normalizeText";
import { buildProductDocuments, tokenizeSearchText } from "./buildProductDocument";
import {
  buildProductEmbeddingIndex,
  cosineSimilarity,
  embedQueryText,
  extractMatchingTerms,
} from "./productEmbedding";
import type {
  ProductEmbeddingIndex,
  ProductSearchDiagnostics,
  ProductSearchResult,
} from "./productSearchTypes";

const SEMANTIC_MIN_SIMILARITY = 0.28;
const SEMANTIC_MIN_MEANINGFUL_TOKENS = 1;

const QUERY_STOPWORDS = new Set([
  "a",
  "ay",
  "ban",
  "bao",
  "cai",
  "cho",
  "co",
  "con",
  "duoc",
  "gi",
  "gia",
  "ha",
  "hay",
  "hon",
  "khong",
  "la",
  "ma",
  "minh",
  "muon",
  "nao",
  "nay",
  "nhieu",
  "nhung",
  "o",
  "re",
  "san",
  "pham",
  "the",
  "thi",
  "tien",
  "voi",
  "xin",
]);

let cachedIndexKey = "";
let cachedIndex: ProductEmbeddingIndex | null = null;

function getCatalogKey(catalog: CatalogProduct[]): string {
  return catalog.map((product) => product.id).join("|");
}

function getOrCreateIndex(catalog: CatalogProduct[]): ProductEmbeddingIndex {
  const key = getCatalogKey(catalog);
  if (cachedIndex && cachedIndexKey === key) {
    return cachedIndex;
  }

  const documents = buildProductDocuments(catalog);
  cachedIndex = buildProductEmbeddingIndex(documents);
  cachedIndexKey = key;
  return cachedIndex;
}

function meaningfulQueryTokens(query: string): string[] {
  return tokenizeSearchText(normalizeText(query)).filter(
    (token) => !QUERY_STOPWORDS.has(token) && token.length >= 2,
  );
}

function normalizeMatchReasons(reasons: string[]): string[] {
  return [...new Set(reasons.map((reason) => reason.trim()).filter(Boolean))].slice(0, 5);
}

export function searchProducts(
  query: string,
  catalog: CatalogProduct[],
  limit = 5,
): ProductSearchResult[] {
  const meaningfulTokens = meaningfulQueryTokens(query);
  if (meaningfulTokens.length < SEMANTIC_MIN_MEANINGFUL_TOKENS) {
    return [];
  }

  const index = getOrCreateIndex(catalog);
  const queryVector = embedQueryText(query, index);
  const results: ProductSearchResult[] = [];

  for (const document of index.documents) {
    const documentVector = index.vectors.get(document.productId);
    if (!documentVector) {
      continue;
    }

    const similarity = cosineSimilarity(queryVector, documentVector);
    const matchReasons = normalizeMatchReasons(
      extractMatchingTerms(queryVector, documentVector),
    );
    const product = catalog.find((entry) => entry.id === document.productId);
    if (!product || similarity <= 0) {
      continue;
    }

    results.push({
      product,
      score: Number((similarity * 100).toFixed(2)),
      similarity: Number(similarity.toFixed(4)),
      matchReasons,
    });
  }

  return results
    .sort(
      (left, right) =>
        right.similarity - left.similarity ||
        right.product.stock - left.product.stock ||
        left.product.name.localeCompare(right.product.name, "vi"),
    )
    .slice(0, limit);
}

export function isSemanticSearchMatch(result: ProductSearchResult | undefined): boolean {
  return Boolean(result && result.similarity >= SEMANTIC_MIN_SIMILARITY);
}

export function buildSearchDiagnostics(
  query: string,
  results: ProductSearchResult[],
): ProductSearchDiagnostics | null {
  const top = results[0];
  if (!top) {
    return null;
  }

  return {
    query,
    matchedProductId: top.product.id,
    matchedProductName: top.product.name,
    score: top.score,
    similarity: top.similarity,
    matchReasons: top.matchReasons,
    topMatches: results.slice(0, 3).map((entry) => ({
      productId: entry.product.id,
      productName: entry.product.name,
      similarity: entry.similarity,
    })),
  };
}

export { SEMANTIC_MIN_SIMILARITY };

const CATEGORY_KEYWORDS: Record<ProductCategory, string[]> = {
  glasses: ["kinh", "mat kinh", "glasses"],
  lipstick: ["son", "son moi", "lipstick"],
  accessory: ["phu kien", "vuong mien", "crown", "mu bucket", "mu"],
  skincare: ["kem chong nang", "skincare", "spf", "chong nang"],
  electronics: ["tai nghe", "bluetooth", "headphones"],
  fashion: ["ao thun", "tui deo cheo", "oversize", "thun"],
};

export function shouldUseSemanticSearch(
  query: string,
  mentionedCategories: ProductCategory[],
): boolean {
  const tokens = meaningfulQueryTokens(query);
  if (tokens.length === 0) {
    return false;
  }

  if (mentionedCategories.length === 0) {
    return true;
  }

  const categoryTerms = new Set<string>();
  for (const category of mentionedCategories) {
    for (const keyword of CATEGORY_KEYWORDS[category] ?? []) {
      categoryTerms.add(keyword);
      for (const token of keyword.split(" ")) {
        categoryTerms.add(token);
      }
    }
  }

  const descriptiveTokens = tokens.filter((token) => !categoryTerms.has(token));
  return descriptiveTokens.length > 0;
}
