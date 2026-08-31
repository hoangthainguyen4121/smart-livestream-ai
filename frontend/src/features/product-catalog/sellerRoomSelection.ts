import type { CatalogProduct } from "./productCatalogTypes";

export function filterSellerProducts(
  products: CatalogProduct[],
  query: string,
): CatalogProduct[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return products;
  return products.filter((product) => product.name.toLowerCase().includes(normalized));
}

export function toggleSelectedProduct(
  selected: ReadonlySet<string>,
  productId: string,
): Set<string> {
  const next = new Set(selected);
  if (next.has(productId)) next.delete(productId);
  else next.add(productId);
  return next;
}

export function paginateProducts<T>(products: T[], page: number, pageSize: number): T[] {
  const safePage = Math.max(1, page);
  return products.slice((safePage - 1) * pageSize, safePage * pageSize);
}
