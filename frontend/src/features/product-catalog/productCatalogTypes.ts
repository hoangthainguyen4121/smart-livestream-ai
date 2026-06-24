import type { BrowserArEffect } from "../browser-ar/types";

export type ProductCategory =
  | "glasses"
  | "lipstick"
  | "accessory"
  | "skincare"
  | "electronics"
  | "fashion";

export type ArEffectType = "glasses" | "lipstick" | "crown" | "none";

export type CatalogProduct = {
  id: string;
  name: string;
  category: ProductCategory;
  description: string;
  price: number;
  stock: number;
  colors: string[];
  sizes: string[];
  imageUrl: string;
  productUrl: string;
  arEffectType: ArEffectType;
  tags: string[];
  sellingPoints: string[];
};

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  glasses: "Kính mắt",
  lipstick: "Son môi",
  accessory: "Phụ kiện",
  skincare: "Skincare",
  electronics: "Điện tử",
  fashion: "Thời trang",
};

export function mapArEffectTypeToBrowserAr(arEffectType: ArEffectType): BrowserArEffect {
  switch (arEffectType) {
    case "glasses":
      return "glasses";
    case "lipstick":
      return "makeup_lite";
    case "crown":
      return "full_filter";
    default:
      return "none";
  }
}

export function getTryOnLabel(arEffectType: ArEffectType): string {
  switch (arEffectType) {
    case "glasses":
      return "Try On — Kính AR";
    case "lipstick":
      return "Try On — Makeup AR";
    case "crown":
      return "Try On — Full Filter AR";
    default:
      return "No AR preview";
  }
}
