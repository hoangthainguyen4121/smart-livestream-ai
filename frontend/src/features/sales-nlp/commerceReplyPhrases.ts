export const PURCHASE_ADD_TO_CART_PHRASE = "thêm vào giỏ hàng";
export const PURCHASE_CHECKOUT_ORDER_PHRASE = "chốt đơn";

export const COMMERCE_CTA_SUFFIX = `Bạn có thể ${PURCHASE_ADD_TO_CART_PHRASE} bên dưới hoặc nhắn ${PURCHASE_CHECKOUT_ORDER_PHRASE} để thanh toán.`;

export const PURCHASE_CLARIFICATION_REPLY_REGEX =
  /^Bạn muốn chốt (.+) phải không ạ\? Bạn có thể thêm vào giỏ hàng bên dưới hoặc nhắn chốt đơn để thanh toán\.$/;

export function formatHighlightedProductName(productName: string): string {
  return productName.toLocaleUpperCase("vi-VN");
}

export function buildPurchaseClarificationReply(productName?: string): string {
  if (productName) {
    return `Bạn muốn chốt ${formatHighlightedProductName(productName)} phải không ạ? ${COMMERCE_CTA_SUFFIX}`;
  }
  return "Bạn muốn chốt sản phẩm nào ạ? Bạn có thể nêu tên sản phẩm hoặc host ghim sản phẩm trên livestream.";
}
