import type { ProductSearchDiagnostics, ProductSearchResult } from "./productSearchTypes";

export function formatSearchDiagnosticsSummary(
  diagnostics: ProductSearchDiagnostics | null | undefined,
): string {
  if (!diagnostics) {
    return "—";
  }

  const reasons =
    diagnostics.matchReasons.length > 0 ? diagnostics.matchReasons.join(", ") : "semantic overlap";
  return `${diagnostics.matchedProductName} (${diagnostics.similarity.toFixed(2)}): ${reasons}`;
}

export function formatTopMatches(results: ProductSearchResult[]): string {
  if (results.length === 0) {
    return "—";
  }

  return results
    .slice(0, 3)
    .map((entry) => `${entry.product.name} (${entry.similarity.toFixed(2)})`)
    .join(" · ");
}
