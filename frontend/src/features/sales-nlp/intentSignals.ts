import type { ProductCategory } from "../product-catalog/productCatalogTypes";
import { normalizeText, normalizeToken } from "./normalizeText";
import { detectMentionedCategories } from "./productMentionResolver";

const DEICTIC_PATTERNS: RegExp[] = [
  /\bcai nay\b/,
  /\bmon nay\b/,
  /\bsan pham nay\b/,
  /\bsp nay\b/,
  /\bcai dang cam\b/,
  /\bcai dang deo\b/,
  /\bcai vua noi\b/,
  /\bmau nay\b/,
  /\bem nay\b/,
];

const COMMERCE_INTENT_KEYWORDS =
  /\b(gia|bao nhieu|bn|tien|con hang|con khong|het hang|mau|size|link|ship|chot|mua|dat|khuyen mai|giam gia)\b/;

const PINNED_PRODUCT_PATTERNS: RegExp[] = [
  /\bsan pham ghim\b/,
  /\bsp ghim\b/,
  /\bmon dang ghim\b/,
  /\bsan pham dang ghim\b/,
  /\bmon ghim\b/,
];

const SINGLE_CATEGORY_TOKENS: Record<string, ProductCategory> = {
  son: "lipstick",
  kinh: "glasses",
  ao: "fashion",
};

export function hasDeicticProductReference(comment: string): boolean {
  const text = normalizeText(comment);
  return DEICTIC_PATTERNS.some((pattern) => pattern.test(text));
}

export function isDeicticOnlyComment(comment: string): boolean {
  const text = normalizeText(comment);
  if (!hasDeicticProductReference(text)) {
    return false;
  }
  return !COMMERCE_INTENT_KEYWORDS.test(text);
}

export function isPinnedProductReference(comment: string): boolean {
  const text = normalizeText(comment);
  return PINNED_PRODUCT_PATTERNS.some((pattern) => pattern.test(text));
}

export function isSingleCategoryTokenOnly(comment: string): ProductCategory | null {
  const tokens = normalizeText(comment).split(" ").filter(Boolean);
  if (tokens.length !== 1) {
    return null;
  }
  return SINGLE_CATEGORY_TOKENS[tokens[0]] ?? null;
}

export function isCategoryListingQuestion(comment: string): boolean {
  const text = normalizeText(comment);
  if (detectMentionedCategories(text).length === 0) {
    return false;
  }
  if (/\b(shop\s+)?ban\s+[a-z0-9\s]{1,30}\s+gi\b/.test(text)) {
    return true;
  }
  if (/\bshop\s+co\s+[a-z0-9\s]{1,30}\s+gi\b/.test(text)) {
    return true;
  }
  if (/\bban\s+(nhung\s+loai\s+)?[a-z0-9\s]{1,20}\s+nao\b/.test(text)) {
    return true;
  }
  return false;
}

/** Bare price fragment in live context (e.g. "giá?", "bn") — product binding is resolver policy. */
export function isBarePriceQuery(comment: string): boolean {
  const text = normalizeText(comment);
  return /^(gia|bao nhieu)$/.test(text);
}

export function hasColorVariantQuestion(comment: string): boolean {
  const text = normalizeText(comment);
  return /\b(mau gi|mau nao|co mau nao|con mau nao|co mau gi|mau gi do)\b/.test(text);
}

export function hasSizeVariantQuestion(comment: string): boolean {
  const text = normalizeText(comment);
  return /\b(size gi|size nao|co size nao|con size|co size gi)\b/.test(text) || /\bsize\b/.test(text);
}

export function resolveMlVariantIntent(normalizedComment: string): "ASK_COLOR" | "ASK_SIZE" {
  if (hasSizeVariantQuestion(normalizedComment) && !hasColorVariantQuestion(normalizedComment)) {
    return "ASK_SIZE";
  }
  return "ASK_COLOR";
}

export function buildDeicticIntentClarification(productName: string): string {
  return `Bạn muốn hỏi gì về ${productName} ạ? (giá, còn hàng, màu, size...)`;
}

export function buildPurchaseClarificationReply(productName?: string): string {
  if (productName) {
    return `Bạn muốn chốt ${productName} phải không ạ? Bạn có thể thêm vào giỏ hàng bên dưới hoặc nhắn chốt đơn để checkout demo.`;
  }
  return "Bạn muốn chốt sản phẩm nào ạ? Bạn có thể nêu tên sản phẩm hoặc host ghim sản phẩm trên livestream.";
}

export function tokenMentionsCategory(text: string): ProductCategory[] {
  const categories = detectMentionedCategories(text);
  const tokens = text.split(" ").filter(Boolean);
  if (tokens.includes("ao") && !categories.includes("fashion")) {
    categories.push("fashion");
  }
  if (tokens.includes("son") && !categories.includes("lipstick")) {
    categories.push("lipstick");
  }
  if (tokens.includes("kinh") && !categories.includes("glasses")) {
    categories.push("glasses");
  }
  return categories;
}

export function normalizeProductNameToken(name: string): string {
  return normalizeToken(name);
}
