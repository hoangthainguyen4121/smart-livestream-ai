import { describe, expect, it } from "vitest";

import type { CatalogProduct } from "../product-catalog/productCatalogTypes";
import {
  addToCart,
  getCartItemCount,
  getCartSubtotal,
  removeFromCart,
  updateCartQuantity,
} from "./cartLogic";

const mockProduct: CatalogProduct = {
  id: "demo-lipstick",
  name: "Son Demo",
  category: "lipstick",
  description: "Demo product",
  price: 250_000,
  stock: 10,
  colors: ["đỏ", "hồng"],
  sizes: [],
  imageUrl: "/demo.png",
  productUrl: "https://example.com/demo",
  arEffectType: "lipstick",
  tags: ["son"],
  sellingPoints: ["Demo"],
};

describe("cartLogic", () => {
  it("adds a new line with default color", () => {
    const items = addToCart([], { product: mockProduct, quantity: 1 });
    expect(items).toHaveLength(1);
    expect(items[0].color).toBe("đỏ");
    expect(items[0].quantity).toBe(1);
  });

  it("merges quantity for same product variant", () => {
    const first = addToCart([], { product: mockProduct, quantity: 1, color: "hồng" });
    const merged = addToCart(first, { product: mockProduct, quantity: 2, color: "hồng" });
    expect(merged).toHaveLength(1);
    expect(merged[0].quantity).toBe(3);
  });

  it("computes subtotal and item count", () => {
    const items = addToCart([], { product: mockProduct, quantity: 2 });
    expect(getCartSubtotal(items)).toBe(500_000);
    expect(getCartItemCount(items)).toBe(2);
  });

  it("removes lines and updates quantity", () => {
    const items = addToCart([], { product: mockProduct, quantity: 3 });
    const lineId = items[0].lineId;
    const updated = updateCartQuantity(items, lineId, 1);
    expect(updated[0].quantity).toBe(1);
    expect(removeFromCart(updated, lineId)).toHaveLength(0);
  });
});
