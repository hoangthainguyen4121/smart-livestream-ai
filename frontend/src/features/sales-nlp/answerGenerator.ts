import type { CatalogProduct } from "../product-catalog/productCatalogTypes";
import type { ExtractedEntities, SalesNlpIntent } from "./salesNlpTypes";

export function formatVnd(price: number): string {
  return `${price.toLocaleString("vi-VN")}đ`;
}

function formatColorList(colors: string[]): string {
  if (colors.length === 0) {
    return "theo catalog hiện tại";
  }
  if (colors.length === 1) {
    return colors[0];
  }
  return `${colors.slice(0, -1).join(", ")} và ${colors[colors.length - 1]}`;
}

export function generateAnswer(
  intent: Exclude<SalesNlpIntent, "UNKNOWN">,
  product: CatalogProduct,
  entities: ExtractedEntities,
  comparedProducts: CatalogProduct[],
): string {
  switch (intent) {
    case "ASK_PRICE":
      return `${product.name} hiện có giá ${formatVnd(product.price)}. Bạn muốn mình gửi link mua hàng không?`;
    case "ASK_STOCK":
      return `${product.name} hiện còn ${product.stock} sản phẩm trong kho.`;
    case "ASK_COLOR": {
      const colorList = formatColorList(product.colors);
      if (entities.colors.length > 0) {
        return `${product.name} có màu ${colorList}. Màu ${entities.colors[0]} vẫn có thể chọn theo catalog hiện tại.`;
      }
      return `${product.name} hiện có màu ${colorList}.`;
    }
    case "ASK_SIZE": {
      if (product.sizes.length === 0) {
        return `${product.name} không có size riêng trong catalog POC. Host sẽ xác nhận thêm nếu bạn cần.`;
      }
      const sizeList = product.sizes.join(", ");
      if (entities.sizes.length > 0) {
        return `${product.name} đang có size ${sizeList}. Size ${entities.sizes[0]} còn theo catalog hiện tại.`;
      }
      return `${product.name} đang có size ${sizeList}.`;
    }
    case "ASK_LINK":
      return `Bạn có thể xem ${product.name} tại ${product.productUrl}.`;
    case "ASK_SHIPPING":
      if (entities.shippingLocation) {
        return `POC chưa có bảng phí ship chi tiết. Host sẽ xác nhận giao ${entities.shippingLocation} qua inbox.`;
      }
      return "POC chưa có bảng phí ship chi tiết. Host sẽ xác nhận khu vực giao hàng qua inbox.";
    case "ASK_PROMOTION":
      return `${product.name} chưa có khuyến mãi riêng trong catalog POC. Host sẽ xác nhận ưu đãi trực tiếp nếu có.`;
    case "ASK_PRODUCT_INFO":
      return `${product.name}: ${product.description} Điểm nổi bật: ${product.sellingPoints.join(", ")}.`;
    case "COMPARE_PRODUCTS": {
      if (comparedProducts.length >= 2) {
        const [first, second] = comparedProducts;
        return `${first.name} (${formatVnd(first.price)}, còn ${first.stock}) so với ${second.name} (${formatVnd(second.price)}, còn ${second.stock}). Bạn muốn thử sản phẩm nào trên livestream?`;
      }
      return "Bạn có thể nêu rõ 2 sản phẩm cần so sánh. Host sẽ tư vấn thêm nếu cần.";
    }
    case "PURCHASE_INTENT":
      if (entities.quantity) {
        return `Cảm ơn bạn. Mình sẽ inbox để xác nhận ${entities.quantity} sản phẩm ${product.name} và thông tin giao hàng.`;
      }
      return "Cảm ơn bạn. Mình sẽ inbox để xác nhận đơn hàng và thông tin giao hàng.";
    default:
      return "Host sẽ trả lời thủ công cho câu hỏi này.";
  }
}
