import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertSingleShop,
  checkoutOrder,
  listProducts,
  mapApiProduct,
  uploadProductImage,
} from "./commerce";
import type { CartLineItem } from "../features/commerce/commerceTypes";

const line = (shopId: string, productId: string): CartLineItem => ({
  lineId: productId,
  productId,
  shopId,
  productName: productId,
  unitPrice: 10,
  quantity: 1,
  color: null,
  size: null,
});

describe("seller products and room selection", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("maps backend snake_case product fields", () => {
    expect(mapApiProduct({
      id: "p1",
      shop_id: "s1",
      name: "Kính",
      category: "glasses",
      price: 299000,
      stock: 4,
      image_url: "/p1.png",
      ar_effect_type: "glasses",
      selling_points: ["Nhẹ"],
    })).toMatchObject({
      id: "p1",
      shopId: "s1",
      imageUrl: "/p1.png",
      arEffectType: "glasses",
      sellingPoints: ["Nhẹ"],
    });
  });

  it("resolves uploaded media URLs against the API origin", () => {
    expect(mapApiProduct({
      id: "p2",
      image_url: "/media/product-images/demo.webp",
    }).imageUrl).toBe("http://127.0.0.1:8000/media/product-images/demo.webp");
  });

  it("uploads a product image as multipart form data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      image_url: "/media/product-images/demo.webp",
    }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(uploadProductImage(
      new File(["image"], "demo.png", { type: "image/png" }),
    )).resolves.toBe("/media/product-images/demo.webp");

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(request.body).toBeInstanceOf(FormData);
    expect(new Headers(request.headers).has("Content-Type")).toBe(false);
  });

  it("loads the room-specific catalog", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { id: "p1", shop_id: "s1", name: "Room product", category: "fashion" },
    ]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const products = await listProducts({ roomId: "room 1" });
    expect(products.map((product) => product.id)).toEqual(["p1"]);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/rooms/room%201/products");
  });

  it("blocks mixed-shop checkout", () => {
    expect(assertSingleShop([line("s1", "p1"), line("s1", "p2")])).toBe("s1");
    expect(() => assertSingleShop([line("s1", "p1"), line("s2", "p2")]))
      .toThrow("một cửa hàng");
  });

  it("creates an order and completes sandbox payment", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "o1", total_amount: 10, status: "pending_payment", created_at: "2026-01-01T00:00:00Z",
      }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "pay1", status: "pending" }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "pay1", status: "succeeded" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const order = await checkoutOrder([line("s1", "p1")], {
      customerName: "Buyer",
      phone: "0900000000",
      address: "HCM",
      shippingMethod: "standard",
      paymentMethod: "mock_qr",
      sandboxResult: "success",
    }, { roomId: "room-a" });

    expect(order).toMatchObject({ orderId: "o1", status: "paid" });
    const [orderCall, paymentCall, sandboxCall] = fetchMock.mock.calls;
    expect(String(orderCall[0])).toContain("/api/orders");
    expect(JSON.parse(String(orderCall[1].body))).toMatchObject({
      shipping_name: "Buyer",
      shipping_address: "HCM",
      phone: "0900000000",
      room_id: "room-a",
      items: [{ product_id: "p1", quantity: 1 }],
    });
    expect(String(paymentCall[0])).toContain("/api/orders/o1/payments");
    expect(JSON.parse(String(paymentCall[1].body))).toEqual({ method: "sandbox" });
    expect(String(sandboxCall[0])).toContain("/api/payments/pay1/sandbox-result");
    expect(JSON.parse(String(sandboxCall[1].body))).toEqual({ result: "success" });
  });

  it("confirms a COD order from the backend payment state", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "o3", total_amount: 10, status: "pending_payment",
      }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "pay3", status: "succeeded" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const order = await checkoutOrder([line("s1", "p1")], {
      customerName: "Buyer",
      phone: "0900000000",
      address: "HCM",
      shippingMethod: "standard",
      paymentMethod: "cod",
      sandboxResult: "success",
    });

    expect(order.status).toBe("cod_confirmed");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toEqual({ method: "cod" });
  });

  it("shows a failed sandbox result from backend state", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "o2", total_amount: 10, status: "pending_payment",
      }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "pay2", status: "pending" }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "pay2", status: "failed" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const order = await checkoutOrder([line("s1", "p1")], {
      customerName: "Buyer",
      phone: "0900000000",
      address: "HCM",
      shippingMethod: "standard",
      paymentMethod: "mock_qr",
      sandboxResult: "failure",
    });

    expect(order.status).toBe("failed");
    expect(JSON.parse(String(fetchMock.mock.calls[2][1].body))).toEqual({ result: "failure" });
  });
});
