import type { CatalogProduct, ProductCategory } from "../product-catalog/productCatalogTypes";
import { normalizeText, normalizeToken } from "../sales-nlp/normalizeText";
import type { ProductSearchDocument } from "./productSearchTypes";

const CATEGORY_LABELS: Record<ProductCategory, string> = {
  glasses: "kinh mat kinh thoi trang",
  lipstick: "son son moi trang diem makeup beauty",
  accessory: "phu kien toc deo dau",
  skincare: "skincare cham soc da kem duong",
  electronics: "tai nghe am thanh cong nghe",
  fashion: "thoi trang quan ao phu kien",
};

const SEMANTIC_EXPANSIONS: Record<string, string[]> = {
  "glasses-a": ["kinh thoi trang", "livestream", "deo hang ngay", "mat kinh"],
  "glasses-urban": [
    "kinh chong nang",
    "kinh ram",
    "chong uv",
    "di nang",
    "urban",
    "mat troi",
  ],
  "lipstick-ruby": [
    "di tiec",
    "trang diem",
    "son do",
    "ruby",
    "mau do",
    "noi bat",
    "party",
    "makeup",
  ],
  "lipstick-coral": ["everyday", "di lam", "cam dat", "tone nhe", "hang ngay"],
  "crown-accessory": [
    "vuong mien",
    "deo tren dau",
    "mon dang deo tren dau",
    "filter ar",
    "livestream trend",
  ],
  "bucket-hat": ["mu bucket", "streetwear", "che nang"],
  "headphones-mini": [
    "tai nghe bluetooth",
    "true wireless",
    "nghe nhac",
    "am thanh",
    "khong day",
  ],
  "sunscreen-spf50": [
    "da dau",
    "da nhay cam",
    "spf50",
    "chong nang",
    "kem chong nang",
    "skincare",
    "san pham cho da dau",
  ],
  "crossbody-basic": ["tui deo cheo", "dung phone", "basic"],
  "oversize-tee": ["ao thun", "oversize", "cotton", "unisex"],
};

export function tokenizeSearchText(text: string): string[] {
  const normalized = normalizeText(text);
  if (!normalized) {
    return [];
  }

  const tokens = new Set<string>();
  for (const chunk of normalized.split(" ")) {
    if (chunk.length >= 2) {
      tokens.add(chunk);
    }
  }

  for (let index = 0; index < normalized.length - 1; index += 1) {
    const bigram = normalized.slice(index, index + 2).trim();
    if (bigram.length >= 4 && bigram.includes(" ")) {
      tokens.add(bigram);
    }
  }

  const phrases = normalized.match(/\b\w+(?: \w+){1,3}\b/g) ?? [];
  for (const phrase of phrases) {
    if (phrase.length >= 5) {
      tokens.add(phrase);
    }
  }

  return [...tokens];
}

export function buildProductDocument(product: CatalogProduct): ProductSearchDocument {
  const semanticTerms = SEMANTIC_EXPANSIONS[product.id] ?? [];
  const sections = [
    `Name: ${product.name}`,
    `Category: ${product.category} ${CATEGORY_LABELS[product.category] ?? ""}`,
    `Description: ${product.description}`,
    `Tags: ${product.tags.join(" ")}`,
    `Colors: ${product.colors.join(" ")}`,
    `Selling points: ${product.sellingPoints.join(" ")}`,
    `Semantic: ${semanticTerms.join(" ")}`,
  ];

  const body = normalizeText(sections.join("\n"));
  const tokens = tokenizeSearchText(
    [
      product.name,
      product.category,
      product.description,
      ...product.tags,
      ...product.colors,
      ...product.sellingPoints,
      ...semanticTerms,
      CATEGORY_LABELS[product.category] ?? "",
    ]
      .map(normalizeToken)
      .join(" "),
  );

  return {
    productId: product.id,
    name: product.name,
    category: product.category,
    body,
    tokens,
  };
}

export function buildProductDocuments(catalog: CatalogProduct[]): ProductSearchDocument[] {
  return catalog.map(buildProductDocument);
}
