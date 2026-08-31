import { authHeaders, clearAuthToken } from "./auth";
import { getApiBaseUrl } from "./config";
import type {
  ArEffectType,
  CatalogProduct,
  ProductCategory,
} from "../features/product-catalog/productCatalogTypes";
import type { CartLineItem, CheckoutForm, MockOrder } from "../features/commerce/commerceTypes";

export type Shop = {
  id: string;
  name: string;
  slug?: string;
  description?: string | null;
  owner_user_id?: string;
};

export type ProductInput = Omit<CatalogProduct, "id" | "shopId" | "productUrl"> & {
  sku?: string;
  sourceUrl?: string;
  isActive?: boolean;
};

export type RoomProduct = CatalogProduct & {
  position?: number;
  isPinned?: boolean;
};

export class CommerceApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "CommerceApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const hasJsonBody = init?.body != null && !(init.body instanceof FormData);
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      ...authHeaders(),
      ...(hasJsonBody ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    let message = `API request failed (${response.status}).`;
    try {
      const body = (await response.json()) as { detail?: unknown; message?: unknown };
      const detail = body.detail ?? body.message;
      if (typeof detail === "string") {
        message = detail;
      } else if (
        detail &&
        typeof detail === "object" &&
        "message" in detail &&
        typeof (detail as { message: unknown }).message === "string"
      ) {
        message = (detail as { message: string }).message;
      }
    } catch {
      // Keep status error.
    }
    if (response.status === 401) clearAuthToken();
    throw new CommerceApiError(response.status, friendlyCommerceError(response.status, message));
  }
  return (response.status === 204 ? undefined : response.json()) as Promise<T>;
}

function friendlyCommerceError(status: number, message: string): string {
  if (status === 401) {
    return "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại để tiếp tục.";
  }
  if (status === 403) {
    return "Bạn không có quyền thực hiện thao tác này với shop hoặc phòng hiện tại.";
  }
  if (status === 422) {
    return "Dữ liệu chưa hợp lệ. Hãy kiểm tra lại các trường đã nhập.";
  }
  if (/shop_required|create a shop first/i.test(message)) {
    return "Bạn chưa có cửa hàng. Hãy tạo cửa hàng trước khi tiếp tục.";
  }
  if (/insufficient_stock|stock/i.test(message)) {
    return "Một sản phẩm không còn đủ tồn kho. Hãy cập nhật giỏ hàng.";
  }
  if (status === 404) {
    return "Không tìm thấy dữ liệu yêu cầu.";
  }
  if (status === 409) {
    return "Thao tác bị trùng hoặc không hợp lệ ở trạng thái hiện tại.";
  }
  if (status >= 500) {
    return "Máy chủ đang gặp sự cố. Hãy thử lại sau.";
  }
  return message;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

export function mapApiProduct(raw: Record<string, unknown>): CatalogProduct {
  const id = String(raw.id ?? "");
  const imageUrl = String(raw.image_url ?? raw.imageUrl ?? "");
  return {
    id,
    shopId: raw.shop_id == null ? undefined : String(raw.shop_id),
    name: String(raw.name ?? ""),
    category: String(raw.category ?? "fashion") as ProductCategory,
    description: String(raw.description ?? ""),
    price: Number(raw.price ?? 0),
    stock: Number(raw.stock ?? raw.stock_quantity ?? 0),
    colors: strings(raw.colors),
    sizes: strings(raw.sizes),
    imageUrl: imageUrl.startsWith("/media/product-images/")
      ? `${getApiBaseUrl()}${imageUrl}`
      : imageUrl,
    productUrl: String(raw.product_url ?? `/products/${id}`),
    arEffectType: String(raw.ar_effect_type ?? "none") as ArEffectType,
    tags: strings(raw.tags),
    sellingPoints: strings(raw.selling_points),
  };
}

export async function uploadProductImage(image: File): Promise<string> {
  const form = new FormData();
  form.append("image", image);
  const result = await request<{ image_url: string }>("/api/products/images", {
    method: "POST",
    body: form,
  });
  return result.image_url;
}

function productPayload(product: Partial<ProductInput>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (product.sku !== undefined) payload.sku = product.sku;
  if (product.name !== undefined) payload.name = product.name;
  if (product.category !== undefined) payload.category = product.category;
  if (product.description !== undefined) payload.description = product.description;
  if (product.price !== undefined) payload.price = product.price;
  if (product.stock !== undefined) payload.stock = product.stock;
  if (product.colors !== undefined) payload.colors = product.colors;
  if (product.sizes !== undefined) payload.sizes = product.sizes;
  if (product.imageUrl !== undefined) {
    const apiBase = getApiBaseUrl().replace(/\/$/, "");
    payload.image_url = product.imageUrl.startsWith(`${apiBase}/media/product-images/`)
      ? product.imageUrl.slice(apiBase.length)
      : product.imageUrl;
  }
  if (product.arEffectType !== undefined) payload.ar_effect_type = product.arEffectType;
  if (product.tags !== undefined) payload.tags = product.tags;
  if (product.sellingPoints !== undefined) payload.selling_points = product.sellingPoints;
  if (product.sourceUrl !== undefined) payload.source_url = product.sourceUrl;
  if (product.isActive !== undefined) payload.is_active = product.isActive;
  return payload;
}

export async function getMyShop(): Promise<Shop | null> {
  try {
    return await request<Shop>("/api/shops/me");
  } catch (error) {
    // Seller mới chưa có shop: 404 là trạng thái hợp lệ, không phải lỗi.
    if (error instanceof CommerceApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export function getShop(shopId: string): Promise<Shop> {
  return request(`/api/shops/${encodeURIComponent(shopId)}`);
}

export function createShop(input: { name: string; description?: string }): Promise<Shop> {
  return request("/api/shops", { method: "POST", body: JSON.stringify(input) });
}

export async function listProducts(
  filters: { roomId?: string; shopId?: string } = {},
): Promise<CatalogProduct[]> {
  if (filters.roomId) {
    return listRoomProducts(filters.roomId);
  }
  const query = new URLSearchParams();
  if (filters.shopId) query.set("shop_id", filters.shopId);
  const suffix = query.size ? `?${query}` : "";
  const body = await request<Array<Record<string, unknown>>>(`/api/products${suffix}`);
  return body.map(mapApiProduct);
}

export async function listRoomProducts(roomId: string): Promise<RoomProduct[]> {
  const body = await request<Array<Record<string, unknown>>>(
    `/api/rooms/${encodeURIComponent(roomId)}/products`,
  );
  return body.map((row) => ({
    ...mapApiProduct(row),
    position: typeof row.position === "number" ? row.position : undefined,
    isPinned: Boolean(row.is_pinned),
  }));
}

export async function createProduct(shopId: string, input: ProductInput): Promise<CatalogProduct> {
  const sku =
    input.sku?.trim() ||
    `sku-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  return mapApiProduct(
    await request<Record<string, unknown>>(`/api/shops/${shopId}/products`, {
      method: "POST",
      body: JSON.stringify(productPayload({ ...input, sku })),
    }),
  );
}

export async function updateProduct(
  id: string,
  input: Partial<ProductInput>,
): Promise<CatalogProduct> {
  return mapApiProduct(
    await request<Record<string, unknown>>(`/api/products/${id}`, {
      method: "PATCH",
      body: JSON.stringify(productPayload(input)),
    }),
  );
}

export function deleteProduct(id: string): Promise<void> {
  return request(`/api/products/${id}`, { method: "DELETE" });
}

export function attachRoomProduct(roomId: string, productId: string): Promise<unknown> {
  return request(`/api/rooms/${encodeURIComponent(roomId)}/products`, {
    method: "POST",
    body: JSON.stringify({ product_id: productId }),
  });
}

export function pinRoomProduct(roomId: string, productId: string | null): Promise<unknown> {
  return request(`/api/rooms/${encodeURIComponent(roomId)}/products/pin`, {
    method: "POST",
    body: JSON.stringify({ product_id: productId }),
  });
}

export function assertSingleShop(items: CartLineItem[]): string {
  const ids = new Set(items.map((item) => item.shopId).filter(Boolean));
  if (ids.size !== 1) {
    throw new Error("Checkout chỉ hỗ trợ sản phẩm từ một cửa hàng.");
  }
  return [...ids][0]!;
}

export async function checkoutOrder(
  items: CartLineItem[],
  form: CheckoutForm,
  options?: { roomId?: string | null },
): Promise<MockOrder> {
  assertSingleShop(items);
  const orderRaw = await request<Record<string, unknown>>("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      shipping_name: form.customerName,
      shipping_address: form.address,
      phone: form.phone,
      room_id: options?.roomId || undefined,
      items: items.map((item) => ({
        product_id: item.productId,
        quantity: item.quantity,
      })),
    }),
  });
  const orderId = String(orderRaw.id);
  const method = form.paymentMethod === "mock_qr" ? "sandbox" : "cod";
  const payment = await request<Record<string, unknown>>(`/api/orders/${orderId}/payments`, {
    method: "POST",
    body: JSON.stringify({ method }),
  });

  let status = String(orderRaw.status ?? "pending_payment");
  if (method === "sandbox") {
    const paymentId = String(payment.id);
    const result = await request<Record<string, unknown>>(
      `/api/payments/${paymentId}/sandbox-result`,
      {
        method: "POST",
        body: JSON.stringify({ result: form.sandboxResult }),
      },
    );
    status = String(
      result.status === "succeeded"
        ? "paid"
        : result.status === "failed"
          ? "failed"
          : result.status ?? status,
    );
  } else {
    status = String(payment.status ?? status);
  }

  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const total = Number(orderRaw.total_amount ?? subtotal);
  return {
    orderId,
    items: items.map((item) => ({ ...item })),
    subtotal,
    shippingFee: Math.max(0, total - subtotal),
    total,
    checkout: form,
    status:
      status === "failed"
        ? "failed"
        : status === "paid" || status === "succeeded" || status === "confirmed"
          ? form.paymentMethod === "cod"
            ? "cod_confirmed"
            : "paid"
          : "pending",
    createdAt: String(orderRaw.created_at ?? new Date().toISOString()),
  };
}
