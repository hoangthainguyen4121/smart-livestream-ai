import type { CatalogProduct } from "../product-catalog/productCatalogTypes";

export type CartLineItem = {
  lineId: string;
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  color: string | null;
  size: string | null;
};

export type ShippingMethod = "standard" | "express";

export type PaymentMethod = "cod" | "mock_qr";

export type OrderStatus = "pending" | "paid" | "cod_confirmed";

export type CheckoutForm = {
  customerName: string;
  phone: string;
  address: string;
  shippingMethod: ShippingMethod;
  paymentMethod: PaymentMethod;
};

export type MockOrder = {
  orderId: string;
  items: CartLineItem[];
  subtotal: number;
  shippingFee: number;
  total: number;
  checkout: CheckoutForm;
  status: OrderStatus;
  createdAt: string;
};

export type AddToCartInput = {
  product: CatalogProduct;
  quantity?: number;
  color?: string | null;
  size?: string | null;
};

export type CommerceActionType = "add_to_cart" | "open_checkout" | "open_cart";

export type CommerceSuggestedAction = {
  id: string;
  type: CommerceActionType;
  label: string;
  productId?: string;
  quantity?: number;
  color?: string | null;
  size?: string | null;
};

export const SHIPPING_FEES: Record<ShippingMethod, number> = {
  standard: 30_000,
  express: 50_000,
};

export const SHIPPING_METHOD_LABELS: Record<ShippingMethod, string> = {
  standard: "Giao tiêu chuẩn (3–5 ngày)",
  express: "Giao nhanh (1–2 ngày)",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cod: "COD — thanh toán khi nhận hàng",
  mock_qr: "Mock QR — quét mã demo",
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Đang chờ thanh toán",
  paid: "Đã thanh toán (mock QR)",
  cod_confirmed: "COD — đã xác nhận",
};
