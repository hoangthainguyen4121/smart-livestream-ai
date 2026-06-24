import { getCartSubtotal } from "./cartLogic";
import type {
  CartLineItem,
  CheckoutForm,
  MockOrder,
  OrderStatus,
  PaymentMethod,
  ShippingMethod,
} from "./commerceTypes";
import { SHIPPING_FEES } from "./commerceTypes";

export function createMockOrderId(): string {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `LS-${Date.now().toString().slice(-8)}-${suffix}`;
}

export function resolveInitialOrderStatus(paymentMethod: PaymentMethod): OrderStatus {
  return paymentMethod === "cod" ? "cod_confirmed" : "pending";
}

export function createMockOrder(
  items: CartLineItem[],
  checkout: CheckoutForm,
): MockOrder {
  const subtotal = getCartSubtotal(items);
  const shippingFee = SHIPPING_FEES[checkout.shippingMethod];

  return {
    orderId: createMockOrderId(),
    items: items.map((item) => ({ ...item })),
    subtotal,
    shippingFee,
    total: subtotal + shippingFee,
    checkout,
    status: resolveInitialOrderStatus(checkout.paymentMethod),
    createdAt: new Date().toISOString(),
  };
}

export function markMockOrderPaid(order: MockOrder): MockOrder {
  return {
    ...order,
    status: "paid",
  };
}

export function countPhoneDigits(phone: string): number {
  return (phone.match(/\d/g) ?? []).length;
}

export type CheckoutValidationErrors = {
  customerName?: string;
  phone?: string;
  address?: string;
  cart?: string;
};

export function getCheckoutValidationErrors(
  form: CheckoutForm,
  cartItemCount = 1,
): CheckoutValidationErrors {
  const errors: CheckoutValidationErrors = {};

  if (form.customerName.trim().length < 1) {
    errors.customerName = "Nhập ít nhất 1 ký tự.";
  }

  if (countPhoneDigits(form.phone) < 9) {
    errors.phone = "Số điện thoại cần ít nhất 9 chữ số.";
  }

  if (form.address.trim().length < 1) {
    errors.address = "Nhập ít nhất 1 ký tự.";
  }

  if (cartItemCount <= 0) {
    errors.cart = "Giỏ hàng trống — thêm sản phẩm trước khi checkout.";
  }

  return errors;
}

export function formatCheckoutBlockers(errors: CheckoutValidationErrors): string {
  const parts: string[] = [];
  if (errors.customerName) {
    parts.push(`Họ tên: ${errors.customerName}`);
  }
  if (errors.phone) {
    parts.push(`SĐT: ${errors.phone}`);
  }
  if (errors.address) {
    parts.push(`Địa chỉ: ${errors.address}`);
  }
  if (errors.cart) {
    parts.push(errors.cart);
  }

  return parts.length > 0 ? `Chưa thể xác nhận — ${parts.join(" · ")}` : "";
}

export function isCheckoutFormValid(form: CheckoutForm, cartItemCount = 1): boolean {
  return Object.keys(getCheckoutValidationErrors(form, cartItemCount)).length === 0;
}

export function getDefaultCheckoutForm(): CheckoutForm {
  return {
    customerName: "",
    phone: "",
    address: "",
    shippingMethod: "standard" satisfies ShippingMethod,
    paymentMethod: "cod" satisfies PaymentMethod,
  };
}
