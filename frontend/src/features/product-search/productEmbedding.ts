import { normalizeText } from "../sales-nlp/normalizeText";
import { tokenizeSearchText } from "./buildProductDocument";
import type { ProductEmbeddingIndex, ProductSearchDocument } from "./productSearchTypes";

function termFrequency(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

function normalizeVector(vector: Map<string, number>): Map<string, number> {
  let magnitude = 0;
  for (const value of vector.values()) {
    magnitude += value * value;
  }
  magnitude = Math.sqrt(magnitude) || 1;

  const normalized = new Map<string, number>();
  for (const [term, value] of vector.entries()) {
    normalized.set(term, value / magnitude);
  }
  return normalized;
}

function buildIdf(documents: ProductSearchDocument[]): Map<string, number> {
  const documentFrequency = new Map<string, number>();
  for (const document of documents) {
    const uniqueTerms = new Set(document.tokens);
    for (const term of uniqueTerms) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  const idf = new Map<string, number>();
  const documentCount = Math.max(documents.length, 1);
  for (const [term, frequency] of documentFrequency.entries()) {
    idf.set(term, Math.log((documentCount + 1) / (frequency + 1)) + 1);
  }
  return idf;
}

function vectorizeDocument(
  tokens: string[],
  idf: Map<string, number>,
): Map<string, number> {
  const tf = termFrequency(tokens);
  const vector = new Map<string, number>();
  for (const [term, count] of tf.entries()) {
    const weight = (1 + Math.log(count)) * (idf.get(term) ?? 1);
    vector.set(term, weight);
  }
  return normalizeVector(vector);
}

export function buildProductEmbeddingIndex(
  documents: ProductSearchDocument[],
): ProductEmbeddingIndex {
  const idf = buildIdf(documents);
  const vocabulary = [...idf.keys()].sort();
  const vectors = new Map<string, Map<string, number>>();

  for (const document of documents) {
    vectors.set(document.productId, vectorizeDocument(document.tokens, idf));
  }

  return {
    documents,
    vocabulary,
    idf,
    vectors,
  };
}

export function embedQueryText(
  query: string,
  index: ProductEmbeddingIndex,
): Map<string, number> {
  const tokens = tokenizeSearchText(normalizeText(query));
  return vectorizeDocument(tokens, index.idf);
}

export function cosineSimilarity(
  left: Map<string, number>,
  right: Map<string, number>,
): number {
  let dot = 0;
  for (const [term, leftValue] of left.entries()) {
    const rightValue = right.get(term);
    if (rightValue) {
      dot += leftValue * rightValue;
    }
  }
  return Math.max(0, Math.min(1, dot));
}

export function extractMatchingTerms(
  queryVector: Map<string, number>,
  documentVector: Map<string, number>,
): string[] {
  const matches: string[] = [];
  for (const term of queryVector.keys()) {
    if (documentVector.has(term)) {
      matches.push(term);
    }
  }
  return matches.sort((left, right) => right.length - left.length);
}
