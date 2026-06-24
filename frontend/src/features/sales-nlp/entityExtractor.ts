import type { CatalogProduct } from "../product-catalog/productCatalogTypes";
import type { ExtractedEntities } from "./salesNlpTypes";
import { normalizeText } from "./normalizeText";

const SIZE_TOKENS = ["xs", "s", "m", "l", "xl", "xxl", "free size"];
const LOCATION_PATTERNS: Array<{ regex: RegExp; label: string }> = [
  { regex: /\bha noi\b/, label: "Hà Nội" },
  { regex: /\bho chi minh\b/, label: "TP.HCM" },
  { regex: /\btp hcm\b/, label: "TP.HCM" },
  { regex: /\bdanang\b/, label: "Đà Nẵng" },
  { regex: /\bcan tho\b/, label: "Cần Thơ" },
];

export function extractEntities(
  comment: string,
  product: CatalogProduct,
  mentionedProductIds: string[],
): ExtractedEntities {
  const text = normalizeText(comment);
  const colors = extractColors(text, product);
  const sizes = extractSizes(text, product);
  const quantity = extractQuantity(text);
  const shippingLocation = extractShippingLocation(text);

  return {
    colors,
    sizes,
    quantity,
    productKeywords: mentionedProductIds,
    shippingLocation,
    mentionedProductIds,
  };
}

function extractColors(text: string, product: CatalogProduct): string[] {
  const found: string[] = [];
  for (const color of product.colors) {
    const key = normalizeText(color);
    if (text.includes(key)) {
      found.push(color);
    }
  }
  return found;
}

function extractSizes(text: string, product: CatalogProduct): string[] {
  const found: string[] = [];
  for (const size of product.sizes) {
    const key = normalizeText(size);
    if (text.includes(key)) {
      found.push(size);
    }
  }

  for (const token of SIZE_TOKENS) {
    const pattern = new RegExp(`\\bsize ${token}\\b|\\b${token}\\b`);
    if (pattern.test(text)) {
      const normalized = token.toUpperCase() === "FREE SIZE" ? "Free size" : token.toUpperCase();
      if (!found.includes(normalized)) {
        found.push(normalized);
      }
    }
  }

  return found;
}

function extractQuantity(text: string): number | null {
  const patterns = [
    /\blay (\d+) cai\b/,
    /\bmuon mua (\d+) cai\b/,
    /\bmua (\d+) cai\b/,
    /\b(\d+) cai\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return Number.parseInt(match[1], 10);
    }
  }

  return null;
}

function extractShippingLocation(text: string): string | null {
  for (const entry of LOCATION_PATTERNS) {
    if (entry.regex.test(text)) {
      return entry.label;
    }
  }
  return null;
}
