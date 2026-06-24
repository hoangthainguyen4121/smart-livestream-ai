import type { AddToCartInput, CartLineItem } from "./commerceTypes";

export function createLineId(productId: string, color: string | null, size: string | null): string {
  return `${productId}::${color ?? "-"}::${size ?? "-"}`;
}

export function addToCart(
  items: CartLineItem[],
  input: AddToCartInput,
): CartLineItem[] {
  const quantity = Math.max(1, input.quantity ?? 1);
  const color = input.color ?? input.product.colors[0] ?? null;
  const size = input.size ?? input.product.sizes[0] ?? null;
  const lineId = createLineId(input.product.id, color, size);
  const existing = items.find((item) => item.lineId === lineId);

  if (existing) {
    return items.map((item) =>
      item.lineId === lineId
        ? { ...item, quantity: item.quantity + quantity }
        : item,
    );
  }

  return [
    ...items,
    {
      lineId,
      productId: input.product.id,
      productName: input.product.name,
      unitPrice: input.product.price,
      quantity,
      color,
      size,
    },
  ];
}

export function removeFromCart(items: CartLineItem[], lineId: string): CartLineItem[] {
  return items.filter((item) => item.lineId !== lineId);
}

export function updateCartQuantity(
  items: CartLineItem[],
  lineId: string,
  quantity: number,
): CartLineItem[] {
  if (quantity <= 0) {
    return removeFromCart(items, lineId);
  }

  return items.map((item) =>
    item.lineId === lineId ? { ...item, quantity } : item,
  );
}

export function getCartSubtotal(items: CartLineItem[]): number {
  return items.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
}

export function getCartItemCount(items: CartLineItem[]): number {
  return items.reduce((count, item) => count + item.quantity, 0);
}

export function formatVnd(amount: number): string {
  return `${amount.toLocaleString("vi-VN")}đ`;
}
