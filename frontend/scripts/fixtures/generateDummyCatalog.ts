import type {
  ArEffectType,
  CatalogProduct,
  ProductCategory,
} from "../../src/features/product-catalog/productCatalogTypes";

/** Tune these for local NLP stress/regression runs. Generated at runtime only — never commit JSON output. */
export const PRODUCT_COUNT = 1000;
export const RANDOM_COMMENT_COUNT = 10000;
export const SEED = 42;

export const DEFAULT_LOADTEST_PINNED_PRODUCT_ID = "glasses-a";

type CategoryTemplate = {
  key: string;
  category: ProductCategory;
  arEffectType: ArEffectType;
  baseNames: readonly string[];
  colors: readonly string[];
  variants: readonly string[];
  brands: readonly string[];
  tags: readonly string[];
  priceRange: readonly [number, number];
  stockRange: readonly [number, number];
};

/**
 * Edit these arrays to reshape the synthetic catalog without touching generation logic.
 * Each template contributes products in round-robin order until `count` is reached.
 */
export const CATEGORY_TEMPLATES: readonly CategoryTemplate[] = [
  {
    key: "lipstick",
    category: "lipstick",
    arEffectType: "lipstick",
    baseNames: ["Son Ruby", "Son Velvet", "Son Kem Lì", "Son Tint", "Son Bóng"],
    colors: ["đỏ", "cam", "hồng đất", "hồng", "đỏ cherry"],
    variants: ["matte", "glossy", "mini", "full size"],
    brands: ["Luxe", "Glow", "Velvet", "Pure"],
    tags: ["son", "makeup", "môi"],
    priceRange: [89_000, 249_000],
    stockRange: [5, 45],
  },
  {
    key: "glasses",
    category: "glasses",
    arEffectType: "glasses",
    baseNames: ["Kính mắt", "Kính râm", "Kính cận", "Kính thời trang"],
    colors: ["đen", "vàng", "xám", "nâu"],
    variants: ["gọng tròn", "gọng vuông", "polarized"],
    brands: ["Vision", "SunLite", "Classic"],
    tags: ["kính", "mắt", "thời trang"],
    priceRange: [199_000, 599_000],
    stockRange: [8, 35],
  },
  {
    key: "skincare",
    category: "skincare",
    arEffectType: "none",
    baseNames: ["Kem dưỡng", "Serum", "Toner", "Sữa rửa mặt"],
    colors: ["trắng", "xanh", "vàng nhạt"],
    variants: ["50ml", "100ml", "mini"],
    brands: ["Derma", "PureSkin", "Hydra"],
    tags: ["skincare", "dưỡng da", "chăm sóc"],
    priceRange: [79_000, 389_000],
    stockRange: [10, 50],
  },
  {
    key: "shirt",
    category: "fashion",
    arEffectType: "none",
    baseNames: ["Áo thun", "Áo polo", "Áo sơ mi", "Áo basic"],
    colors: ["trắng", "đen", "be", "xám"],
    variants: ["cotton", "oversize", "slim"],
    brands: ["BasicWear", "Urban", "Daily"],
    tags: ["áo", "thời trang", "basic"],
    priceRange: [99_000, 299_000],
    stockRange: [12, 60],
  },
  {
    key: "dress",
    category: "fashion",
    arEffectType: "none",
    baseNames: ["Váy", "Đầm", "Váy midi", "Váy suông"],
    colors: ["hồng", "đen", "trắng", "xanh pastel"],
    variants: ["dài", "ngắn", "linen"],
    brands: ["Chic", "Bloom", "Luna"],
    tags: ["váy", "đầm", "thời trang"],
    priceRange: [149_000, 499_000],
    stockRange: [6, 30],
  },
  {
    key: "shoes",
    category: "fashion",
    arEffectType: "none",
    baseNames: ["Giày sneaker", "Dép quai", "Giày lười", "Sandals"],
    colors: ["trắng", "đen", "be"],
    variants: ["nam", "nữ", "unisex"],
    brands: ["Step", "WalkOn", "Flex"],
    tags: ["giày", "dép", "thời trang"],
    priceRange: [199_000, 899_000],
    stockRange: [5, 40],
  },
  {
    key: "bag",
    category: "accessory",
    arEffectType: "none",
    baseNames: ["Túi đeo chéo", "Ba lô", "Túi tote", "Túi mini"],
    colors: ["nâu", "đen", "be", "đỏ đô"],
    variants: ["da PU", "vải canvas", "compact"],
    brands: ["Carry", "Pack", "MiniGo"],
    tags: ["túi", "phụ kiện", "ba lô"],
    priceRange: [129_000, 449_000],
    stockRange: [8, 35],
  },
  {
    key: "watch",
    category: "accessory",
    arEffectType: "none",
    baseNames: ["Đồng hồ", "Đồng hồ dây da", "Smartwatch", "Đồng hồ kim loại"],
    colors: ["bạc", "vàng", "đen", "rose gold"],
    variants: ["40mm", "42mm", "sport"],
    brands: ["TimeX", "Classic", "Pulse"],
    tags: ["đồng hồ", "phụ kiện"],
    priceRange: [299_000, 1_990_000],
    stockRange: [3, 25],
  },
  {
    key: "phone",
    category: "electronics",
    arEffectType: "none",
    baseNames: ["Ốp lưng", "Cáp sạc", "Tai nghe", "Sạc nhanh"],
    colors: ["đen", "trắng", "xanh"],
    variants: ["USB-C", "Lightning", "wireless"],
    brands: ["TechGo", "ChargePro", "SoundLite"],
    tags: ["điện tử", "phụ kiện điện thoại"],
    priceRange: [49_000, 599_000],
    stockRange: [15, 80],
  },
  {
    key: "household",
    category: "accessory",
    arEffectType: "none",
    baseNames: ["Bình giữ nhiệt", "Ly sứ", "Hộp đựng", "Cốc thủy tinh"],
    colors: ["trắng", "xanh", "hồng pastel"],
    variants: ["500ml", "750ml", "set 2"],
    brands: ["HomeEase", "DailyCup", "StoreIt"],
    tags: ["gia dụng", "nhà cửa"],
    priceRange: [59_000, 249_000],
    stockRange: [20, 100],
  },
  {
    key: "food",
    category: "accessory",
    arEffectType: "none",
    baseNames: ["Snack", "Mứt", "Trà gói", "Granola"],
    colors: ["vàng", "nâu", "xanh lá"],
    variants: ["100g", "250g", "combo"],
    brands: ["Tasty", "FarmFresh", "TeaLeaf"],
    tags: ["thực phẩm", "snack"],
    priceRange: [29_000, 149_000],
    stockRange: [30, 120],
  },
  {
    key: "baby",
    category: "accessory",
    arEffectType: "none",
    baseNames: ["Bình sữa", "Yếm em bé", "Khăn xô", "Tã quần"],
    colors: ["hồng", "xanh", "trắng"],
    variants: ["S", "M", "L"],
    brands: ["BabySoft", "TinyCare", "Cuddle"],
    tags: ["em bé", "mẹ và bé"],
    priceRange: [39_000, 299_000],
    stockRange: [10, 70],
  },
  {
    key: "book",
    category: "accessory",
    arEffectType: "none",
    baseNames: ["Sổ tay", "Bút gel", "Bộ sticker", "Bookmark"],
    colors: ["xanh", "hồng", "vàng"],
    variants: ["A5", "A6", "set 3"],
    brands: ["NoteIt", "WriteWell", "PaperJoy"],
    tags: ["văn phòng phẩm", "sổ"],
    priceRange: [19_000, 89_000],
    stockRange: [25, 150],
  },
  {
    key: "fitness",
    category: "accessory",
    arEffectType: "none",
    baseNames: ["Dây kháng lực", "Túi gym", "Bình lắc", "Thảm yoga"],
    colors: ["đen", "xám", "xanh neon"],
    variants: ["light", "medium", "heavy"],
    brands: ["FitPro", "Active", "Move"],
    tags: ["thể thao", "gym"],
    priceRange: [79_000, 399_000],
    stockRange: [8, 45],
  },
  {
    key: "jewelry",
    category: "accessory",
    arEffectType: "crown",
    baseNames: ["Nhẫn", "Dây chuyền", "Bông tai", "Lắc tay"],
    colors: ["vàng", "bạc", "rose gold"],
    variants: ["minimal", "crystal", "pearl"],
    brands: ["Shine", "Gem", "Luxe"],
    tags: ["trang sức", "phụ kiện"],
    priceRange: [99_000, 799_000],
    stockRange: [5, 30],
  },
];

type CuratedSpec = {
  id: string;
  name: string;
  category: ProductCategory;
  arEffectType: ArEffectType;
  price: number;
  stock: number;
  colors: string[];
  tags: string[];
  sizes?: string[];
};

/** Always inserted first — stable IDs for ambiguity / explicit-match regression cases. */
export const CURATED_HARD_CASE_PRODUCTS: readonly CuratedSpec[] = [
  {
    id: "lipstick-ruby",
    name: "Son Ruby Đỏ",
    category: "lipstick",
    arEffectType: "lipstick",
    price: 189_000,
    stock: 24,
    colors: ["Đỏ"],
    tags: ["son ruby", "son do", "son", "makeup"],
  },
  {
    id: "lipstick-ruby-cam",
    name: "Son Ruby Cam",
    category: "lipstick",
    arEffectType: "lipstick",
    price: 185_000,
    stock: 18,
    colors: ["Cam"],
    tags: ["son ruby cam", "son cam", "son", "makeup"],
  },
  {
    id: "lipstick-ruby-matte",
    name: "Son Ruby Matte",
    category: "lipstick",
    arEffectType: "lipstick",
    price: 195_000,
    stock: 22,
    colors: ["Đỏ"],
    tags: ["son ruby matte", "son matte", "son", "makeup"],
  },
  {
    id: "glasses-a",
    name: "Kính thời trang A",
    category: "glasses",
    arEffectType: "glasses",
    price: 299_000,
    stock: 15,
    colors: ["Đen", "Vàng"],
    tags: ["kính", "kinh thoi trang a", "kính mắt"],
  },
  {
    id: "glasses-b",
    name: "Kính thời trang B",
    category: "glasses",
    arEffectType: "glasses",
    price: 279_000,
    stock: 12,
    colors: ["Xám", "Nâu"],
    tags: ["kính", "kinh thoi trang b", "kính mắt"],
  },
  {
    id: "shirt-basic-white",
    name: "Áo thun basic trắng",
    category: "fashion",
    arEffectType: "none",
    price: 149_000,
    stock: 40,
    colors: ["Trắng"],
    sizes: ["S", "M", "L", "XL"],
    tags: ["ao thun basic trang", "ao basic", "áo", "thời trang"],
  },
  {
    id: "shirt-basic-black",
    name: "Áo thun basic đen",
    category: "fashion",
    arEffectType: "none",
    price: 149_000,
    stock: 35,
    colors: ["Đen"],
    sizes: ["S", "M", "L", "XL"],
    tags: ["ao thun basic den", "ao basic den", "áo", "thời trang"],
  },
  {
    id: "bag-mini-black",
    name: "Túi mini đen",
    category: "accessory",
    arEffectType: "none",
    price: 219_000,
    stock: 20,
    colors: ["Đen"],
    tags: ["tui mini den", "túi mini", "phụ kiện"],
  },
  {
    id: "bag-mini-brown",
    name: "Túi mini nâu",
    category: "accessory",
    arEffectType: "none",
    price: 225_000,
    stock: 16,
    colors: ["Nâu"],
    tags: ["tui mini nau", "túi mini", "phụ kiện"],
  },
  {
    id: "watch-leather",
    name: "Đồng hồ dây da",
    category: "accessory",
    arEffectType: "none",
    price: 890_000,
    stock: 8,
    colors: ["Nâu", "Đen"],
    tags: ["dong ho day da", "đồng hồ", "phụ kiện"],
  },
  {
    id: "watch-metal",
    name: "Đồng hồ dây kim loại",
    category: "accessory",
    arEffectType: "none",
    price: 950_000,
    stock: 6,
    colors: ["Bạc", "Vàng"],
    tags: ["dong ho day kim loai", "đồng hồ", "phụ kiện"],
  },
];

export type GenerateDummyCatalogOptions = {
  count?: number;
  seed?: number;
};

function hashMix(seed: number, index: number, slot: number): number {
  return (seed ^ (index * 2_654_435_761) ^ (slot * 2_246_822_519)) >>> 0;
}

function pickFrom<T>(seed: number, index: number, slot: number, items: readonly T[]): T {
  return items[hashMix(seed, index, slot) % items.length];
}

function deriveInRange(seed: number, index: number, slot: number, range: readonly [number, number]): number {
  const [min, max] = range;
  const span = max - min + 1;
  return min + (hashMix(seed, index, slot) % span);
}

function normalizeTag(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function capitalizeWords(value: string): string {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function curatedToProduct(spec: CuratedSpec): CatalogProduct {
  return {
    id: spec.id,
    name: spec.name,
    category: spec.category,
    description: `${spec.name} — sản phẩm mẫu cho load test NLP (curated hard case).`,
    price: spec.price,
    stock: spec.stock,
    colors: spec.colors,
    sizes: spec.sizes ?? (spec.category === "fashion" ? ["S", "M", "L"] : []),
    imageUrl: `/products/images/${spec.id}.svg`,
    productUrl: `/products/${spec.id}`,
    arEffectType: spec.arEffectType,
    tags: spec.tags,
    sellingPoints: ["Curated hard case", "Catalog NLP regression"],
  };
}

function generatedProduct(template: CategoryTemplate, sequence: number, seed: number): CatalogProduct {
  const baseName = pickFrom(seed, sequence, 1, template.baseNames);
  const color = pickFrom(seed, sequence, 2, template.colors);
  const variant = pickFrom(seed, sequence, 3, template.variants);
  const brand = pickFrom(seed, sequence, 4, template.brands);
  const name = `${baseName} ${capitalizeWords(color)} ${capitalizeWords(variant)}`;
  const id = `${template.key}-gen-${String(sequence).padStart(4, "0")}`;
  const price = deriveInRange(seed, sequence, 5, template.priceRange);
  const stock = deriveInRange(seed, sequence, 6, template.stockRange);
  const colorLabel = capitalizeWords(color);
  const tags = [
    ...template.tags,
    normalizeTag(name),
    normalizeTag(baseName),
    normalizeTag(`${brand} ${baseName}`),
    template.key,
  ];

  return {
    id,
    name,
    category: template.category,
    description: `${brand} ${name} — mô tả ngắn cho kiểm thử NLP catalog lớn.`,
    price,
    stock,
    colors: [colorLabel],
    sizes:
      template.category === "fashion"
        ? ["S", "M", "L", "XL"].slice(0, 1 + (hashMix(seed, sequence, 7) % 4))
        : [],
    imageUrl: `/products/images/${id}.svg`,
    productUrl: `/products/${id}`,
    arEffectType: template.arEffectType,
    tags: [...new Set(tags)],
    sellingPoints: ["Load test catalog", brand],
  };
}

export function generateDummyCatalog(options: GenerateDummyCatalogOptions = {}): CatalogProduct[] {
  const count = options.count ?? PRODUCT_COUNT;
  const seed = options.seed ?? SEED;

  const catalog: CatalogProduct[] = CURATED_HARD_CASE_PRODUCTS.map(curatedToProduct);
  const usedIds = new Set(catalog.map((product) => product.id));
  let sequence = 0;

  while (catalog.length < count) {
    const template = CATEGORY_TEMPLATES[sequence % CATEGORY_TEMPLATES.length];
    const product = generatedProduct(template, sequence, seed);
    sequence += 1;

    if (!usedIds.has(product.id)) {
      usedIds.add(product.id);
      catalog.push(product);
    }
  }

  return catalog.slice(0, count);
}

export function findCatalogProduct(catalog: CatalogProduct[], productId: string): CatalogProduct {
  const product = catalog.find((entry) => entry.id === productId);
  if (!product) {
    throw new Error(`Missing catalog product: ${productId}`);
  }
  return product;
}
