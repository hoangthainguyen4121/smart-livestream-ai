import { describe, expect, it } from "vitest";

import { getAllProducts } from "../product-catalog/productCatalogService";
import { resolveProductContext } from "./productContextResolver";

const catalog = getAllProducts();
const glassesA = catalog.find((product) => product.id === "glasses-a")!;
const lipstickRuby = catalog.find((product) => product.id === "lipstick-ruby")!;
const oversizeTee = catalog.find((product) => product.id === "oversize-tee")!;

describe("resolveProductContext", () => {
  it("prefers camera product over pinned product for deictic comments", () => {
    const resolution = resolveProductContext({
      comment: "cái này bao nhiêu?",
      catalog,
      pinnedProductId: lipstickRuby.id,
      selectedCameraProductId: glassesA.id,
    });

    expect(resolution.product?.id).toBe(glassesA.id);
    expect(resolution.source).toBe("camera_context");
    expect(resolution.confidence).toBeGreaterThan(0.8);
    expect(resolution.explanation).toContain("camera product");
  });

  it("uses pinned product for deictic comments when camera product is missing", () => {
    const resolution = resolveProductContext({
      comment: "món này còn hàng không?",
      catalog,
      pinnedProductId: lipstickRuby.id,
      selectedCameraProductId: null,
    });

    expect(resolution.product?.id).toBe(lipstickRuby.id);
    expect(resolution.source).toBe("pinned_product");
    expect(resolution.confidence).toBeGreaterThan(0.7);
  });

  it("prefers explicit catalog match over pinned product", () => {
    const resolution = resolveProductContext({
      comment: "áo trắng bao nhiêu?",
      catalog,
      pinnedProductId: glassesA.id,
      selectedCameraProductId: null,
    });

    expect(resolution.product?.id).toBe(oversizeTee.id);
    expect(resolution.source).toBe("catalog_match");
    expect(resolution.confidence).toBeGreaterThan(0.7);
  });

  it("prefers explicit catalog match over camera product when comment names another product", () => {
    const resolution = resolveProductContext({
      comment: "áo thun trắng còn size M không?",
      catalog,
      pinnedProductId: glassesA.id,
      selectedCameraProductId: glassesA.id,
    });

    expect(resolution.product?.id).toBe(oversizeTee.id);
    expect(resolution.source).toBe("catalog_match");
  });

  it("asks for clarification when deictic comment has no camera or pinned context", () => {
    const resolution = resolveProductContext({
      comment: "mua cái này",
      catalog,
      pinnedProductId: null,
      selectedCameraProductId: null,
    });

    expect(resolution.product).toBeNull();
    expect(resolution.source).toBe("clarification");
    expect(resolution.isClarification).toBe(true);
    expect(resolution.clarificationQuestion).toContain("sản phẩm nào");
    expect(resolution.confidence).toBeLessThan(0.5);
  });

  it("returns source and confidence for pinned fallback without deictic reference", () => {
    const resolution = resolveProductContext({
      comment: "giá bao nhiêu?",
      catalog,
      pinnedProductId: glassesA.id,
      selectedCameraProductId: null,
    });

    expect(resolution.product?.id).toBe(glassesA.id);
    expect(resolution.source).toBe("pinned_product");
    expect(resolution.confidence).toBeCloseTo(0.65, 2);
    expect(resolution.explanation).toContain("pinned product");
  });
});
