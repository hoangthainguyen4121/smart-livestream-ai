import type { CatalogProduct } from "../product-catalog/productCatalogTypes";
import type { ExtractedEntities, SalesNlpIntent } from "../sales-nlp/salesNlpTypes";
import type { CommerceSuggestedAction } from "./commerceTypes";

export function buildCommerceSuggestedActions(
  intent: Exclude<SalesNlpIntent, "UNKNOWN">,
  product: CatalogProduct,
  entities: ExtractedEntities,
): CommerceSuggestedAction[] {
  switch (intent) {
    case "ASK_PRICE":
      return [
        {
          id: "add-to-cart",
          type: "add_to_cart",
          label: "Thêm vào giỏ",
          productId: product.id,
          quantity: entities.quantity ?? 1,
          color: entities.colors[0] ?? product.colors[0] ?? null,
          size: entities.sizes[0] ?? product.sizes[0] ?? null,
        },
        {
          id: "open-cart",
          type: "open_cart",
          label: "Xem giỏ hàng",
        },
      ];
    case "ASK_LINK":
      return [
        {
          id: "add-to-cart",
          type: "add_to_cart",
          label: "Thêm vào giỏ",
          productId: product.id,
          quantity: 1,
        },
        {
          id: "open-cart",
          type: "open_cart",
          label: "Mở giỏ livestream",
        },
      ];
    case "PURCHASE_INTENT":
      return [
        {
          id: "add-to-cart",
          type: "add_to_cart",
          label: "Thêm vào giỏ",
          productId: product.id,
          quantity: entities.quantity ?? 1,
          color: entities.colors[0] ?? product.colors[0] ?? null,
          size: entities.sizes[0] ?? product.sizes[0] ?? null,
        },
        {
          id: "open-checkout",
          type: "open_checkout",
          label: "Checkout ngay",
        },
      ];
    default:
      return [];
  }
}
