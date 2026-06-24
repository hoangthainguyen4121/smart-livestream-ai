export { buildProductDocument, buildProductDocuments, tokenizeSearchText } from "./buildProductDocument";
export {
  buildProductEmbeddingIndex,
  cosineSimilarity,
  embedQueryText,
  extractMatchingTerms,
} from "./productEmbedding";
export {
  buildSearchDiagnostics,
  isSemanticSearchMatch,
  searchProducts,
  shouldUseSemanticSearch,
  SEMANTIC_MIN_SIMILARITY,
} from "./productSearch";
export type {
  ProductEmbeddingIndex,
  ProductSearchDiagnostics,
  ProductSearchDocument,
  ProductSearchResult,
} from "./productSearchTypes";
