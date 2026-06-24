import { describe, expect, it } from "vitest";

import type { CartLineItem } from "./commerceTypes";
import {
  createMockOrder,
  getDefaultCheckoutForm,
  getCheckoutValidationErrors,
  isCheckoutFormValid,
  markMockOrderPaid,
  resolveInitialOrderStatus,
} from "./checkoutService";

const sampleItems: CartLineItem[] = [
  {
    lineId: "demo::đỏ::-",
    productId: "demo-lipstick",
    productName: "Son Demo",
    unitPrice: 250_000,
    quantity: 2,
    color: "đỏ",
    size: null,
  },
];

describe("checkoutService", () => {
  it("validates checkout form with demo-minimal rules", () => {
    const empty = getDefaultCheckoutForm();
    expect(isCheckoutFormValid(empty)).toBe(false);
    expect(getCheckoutValidationErrors(empty, 1).customerName).toBeDefined();
    expect(getCheckoutValidationErrors(empty, 1).phone).toBeDefined();
    expect(getCheckoutValidationErrors(empty, 1).address).toBeDefined();

    expect(
      isCheckoutFormValid({
        ...empty,
        customerName: "Nguyễn Văn A",
        phone: "0901234567",
        address: "Quận 1, TP.HCM",
      }),
    ).toBe(true);
  });

  it("enables confirm for minimal demo input observed in livestream checkout", () => {
    const form = {
      ...getDefaultCheckoutForm(),
      customerName: "a",
      phone: "232323232323",
      address: "a",
    };

    expect(getCheckoutValidationErrors(form, 1)).toEqual({});
    expect(isCheckoutFormValid(form, 1)).toBe(true);
  });

  it("rejects phone with fewer than 9 digits", () => {
    const form = {
      ...getDefaultCheckoutForm(),
      customerName: "a",
      phone: "12345678",
      address: "a",
    };

    expect(isCheckoutFormValid(form, 1)).toBe(false);
    expect(getCheckoutValidationErrors(form, 1).phone).toContain("9 chữ số");
  });

  it("requires a non-empty cart", () => {
    const form = {
      ...getDefaultCheckoutForm(),
      customerName: "a",
      phone: "0901234567",
      address: "a",
    };

    expect(isCheckoutFormValid(form, 0)).toBe(false);
    expect(getCheckoutValidationErrors(form, 0).cart).toBeDefined();
  });

  it("creates mock order with shipping and totals", () => {
    const order = createMockOrder(sampleItems, {
      ...getDefaultCheckoutForm(),
      customerName: "Demo User",
      phone: "0900000000",
      address: "123 Demo Street",
      shippingMethod: "standard",
      paymentMethod: "cod",
    });

    expect(order.orderId).toMatch(/^LS-/);
    expect(order.subtotal).toBe(500_000);
    expect(order.shippingFee).toBe(30_000);
    expect(order.total).toBe(530_000);
    expect(order.status).toBe("cod_confirmed");
  });

  it("resolves payment statuses", () => {
    expect(resolveInitialOrderStatus("cod")).toBe("cod_confirmed");
    expect(resolveInitialOrderStatus("mock_qr")).toBe("pending");

    const pendingOrder = createMockOrder(sampleItems, {
      ...getDefaultCheckoutForm(),
      customerName: "Demo User",
      phone: "0900000000",
      address: "123 Demo Street",
      shippingMethod: "express",
      paymentMethod: "mock_qr",
    });
    expect(markMockOrderPaid(pendingOrder).status).toBe("paid");
  });
});
