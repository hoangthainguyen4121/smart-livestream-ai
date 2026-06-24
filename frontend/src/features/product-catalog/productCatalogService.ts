import { DEMO_PRODUCTS, DEFAULT_PINNED_PRODUCT_ID } from "./products";
import type { CatalogProduct, ProductCategory } from "./productCatalogTypes";

export function getAllProducts(): CatalogProduct[] {
  return DEMO_PRODUCTS;
}

export function getProductById(productId: string): CatalogProduct | undefined {
  return DEMO_PRODUCTS.find((product) => product.id === productId);
}

export function getDefaultPinnedProduct(): CatalogProduct {
  return getProductById(DEFAULT_PINNED_PRODUCT_ID) ?? DEMO_PRODUCTS[0];
}

export function searchAndFilterProducts(options: {
  query?: string;
  category?: ProductCategory | "all";
}): CatalogProduct[] {
  const query = normalizeQuery(options.query ?? "");
  const category = options.category ?? "all";

  return DEMO_PRODUCTS.filter((product) => {
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
