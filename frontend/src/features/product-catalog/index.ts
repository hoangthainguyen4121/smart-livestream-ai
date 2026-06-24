export type { CatalogProduct, ProductCategory, ArEffectType } from "./productCatalogTypes";
export {
  PRODUCT_CATEGORY_LABELS,
  mapArEffectTypeToBrowserAr,
  getTryOnLabel,
} from "./productCatalogTypes";
export { DEMO_PRODUCTS, DEFAULT_PINNED_PRODUCT_ID } from "./products";
export {
  getAllProducts,
  getProductById,
  getDefaultPinnedProduct,
  searchAndFilterProducts,
} from "./productCatalogService";
