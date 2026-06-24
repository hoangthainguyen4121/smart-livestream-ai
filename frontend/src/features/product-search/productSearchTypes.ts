import type { CatalogProduct } from "../product-catalog/productCatalogTypes";

export type ProductSearchDocument = {
  productId: string;
  name: string;
  category: string;
  body: string;
  tokens: string[];
};

export type ProductSearchResult = {
  product: CatalogProduct;
  score: number;
  similarity: number;
  matchReasons: string[];
};

export type ProductSearchDiagnostics = {
  query: string;
  matchedProductId: string;
  matchedProductName: string;
  score: number;
  similarity: number;
  matchReasons: string[];
  topMatches: Array<{
    productId: string;
    productName: string;
    similarity: number;
  }>;
};

export type ProductEmbeddingIndex = {
  documents: ProductSearchDocument[];
  vocabulary: string[];
  idf: Map<string, number>;
  vectors: Map<string, Map<string, number>>;
};
