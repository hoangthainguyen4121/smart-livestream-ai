import { DEMO_PRODUCTS, DEFAULT_PINNED_PRODUCT_ID } from "./products";
import type { CatalogProduct, ProductCategory } from "./productCatalogTypes";

// Backend (PostgreSQL) catalog is the source of truth. Screens publish the catalog they
// loaded from the API here so shared lookups (chat, analytics, NLP fallback) resolve the
// same products. DEMO_PRODUCTS is only an offline fallback.
let activeCatalog: CatalogProduct[] | null = null;

export function setActiveCatalog(products: CatalogProduct[] | null): void {
  activeCatalog = products && products.length > 0 ? [...products] : null;
}

export function getAllProducts(): CatalogProduct[] {
  return activeCatalog ?? [...DEMO_PRODUCTS];
}

export function getProductById(productId: string): CatalogProduct | undefined {
  return getAllProducts().find((product) => product.id === productId);
}

export function getDefaultPinnedProduct(): CatalogProduct {
  const products = getAllProducts();
  return products.find((product) => product.id === DEFAULT_PINNED_PRODUCT_ID) ?? products[0];
}

export function searchAndFilterProducts(options: {
  query?: string;
  category?: ProductCategory | "all";
}): CatalogProduct[] {
  const query = normalizeQuery(options.query ?? "");
  const category = options.category ?? "all";

  return getAllProducts().filter((product) => {
    if (category !== "all" && product.category !== category) {
      return false;
    }

    if (!query) {
      return true;
    }

    const haystack = [
      product.name,
      product.description,
      product.category,
      ...product.tags,
      ...product.colors,
      ...product.sellingPoints,
    ]
      .join(" ")
      .toLowerCase();

    return query.split(" ").every((token) => haystack.includes(token));
  });
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}
