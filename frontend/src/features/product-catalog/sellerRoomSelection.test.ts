import { describe, expect, it } from "vitest";

import type { CatalogProduct } from "./productCatalogTypes";
import {
  filterSellerProducts,
  paginateProducts,
  toggleSelectedProduct,
} from "./sellerRoomSelection";

const product = (id: string, name: string): CatalogProduct => ({
  id,
  shopId: "shop-a",
  name,
  category: "fashion",
  description: "Demo",
  price: 100_000,
  stock: 5,
  colors: [],
  sizes: [],
  imageUrl: "",
  productUrl: `/products/${id}`,
  arEffectType: "none",
  tags: [],
  sellingPoints: [],
});

describe("seller room product selection", () => {
  const products = [
    product("p1", "Áo thun trắng"),
    product("p2", "Kính thời trang"),
    product("p3", "Áo khoác"),
  ];

  it("filters the current shop catalog for room selection", () => {
    expect(filterSellerProducts(products, "áo").map((item) => item.id)).toEqual(["p1", "p3"]);
  });

  it("adds and removes selected room products without mutating prior state", () => {
    const initial = new Set(["p1"]);
    const added = toggleSelectedProduct(initial, "p2");
    const removed = toggleSelectedProduct(added, "p1");
    expect([...initial]).toEqual(["p1"]);
    expect([...added]).toEqual(["p1", "p2"]);
    expect([...removed]).toEqual(["p2"]);
  });

  it("paginates large seeded catalogs", () => {
    expect(paginateProducts(products, 2, 2).map((item) => item.id)).toEqual(["p3"]);
  });
});
