import type { CatalogProduct } from "../../src/features/product-catalog/productCatalogTypes";
import { generateDummyCatalog } from "./generateDummyCatalog";

export const LIPSTICK_COUNT = 100;
export const DEFAULT_LIPSTICK_PINNED_PRODUCT_ID = "lipstick-ruby";

type LipstickSeedSpec = {
  id: string;
  name: string;
  price: number;
  stock: number;
  colors: string[];
  tags: string[];
  variants?: string[];
};

/** Curated anchors — always first, stable IDs for product-understanding regression. */
export const LIPSTICK_CURATED_SPECS: readonly LipstickSeedSpec[] = [
  {
    id: "lipstick-ruby",
    name: "Son Ruby Đỏ",
    price: 189_000,
    stock: 24,
    colors: ["Đỏ"],
    tags: ["son ruby", "son ruby do", "son do"],
  },
  {
    id: "lipstick-ruby-cam",
    name: "Son Ruby Cam",
    price: 185_000,
    stock: 18,
    colors: ["Cam"],
    tags: ["son ruby cam", "son cam"],
  },
  {
    id: "lipstick-ruby-matte",
    name: "Son Ruby Matte",
    price: 195_000,
    stock: 22,
    colors: ["Đỏ"],
    tags: ["son ruby matte", "son matte"],
    variants: ["matte"],
  },
  {
    id: "lipstick-ruby-velvet",
    name: "Son Ruby Velvet",
    price: 199_000,
    stock: 20,
    colors: ["Hồng đất"],
    tags: ["son ruby velvet", "velvet"],
    variants: ["velvet"],
  },
  {
    id: "lipstick-ruby-mini",
    name: "Son Ruby Mini",
    price: 129_000,
    stock: 30,
    colors: ["Đỏ"],
    tags: ["son ruby mini", "mini"],
    variants: ["mini"],
  },
  {
    id: "lipstick-ruby-do-dam",
    name: "Son Ruby Đỏ Đậm",
    price: 205_000,
    stock: 16,
    colors: ["Đỏ đậm"],
    tags: ["son ruby do dam", "do dam"],
  },
  {
    id: "lipstick-ruby-do-cam",
    name: "Son Ruby Đỏ Cam",
    price: 192_000,
    stock: 14,
    colors: ["Đỏ cam"],
    tags: ["son ruby do cam"],
  },
  {
    id: "lipstick-ruby-hong-dat",
    name: "Son Ruby Hồng Đất",
    price: 188_000,
    stock: 19,
    colors: ["Hồng đất"],
    tags: ["son ruby hong dat", "hong dat"],
  },
  {
    id: "lipstick-kem-ruby-do",
    name: "Son Kem Ruby Đỏ",
    price: 175_000,
    stock: 25,
    colors: ["Đỏ"],
    tags: ["son kem ruby do", "son kem"],
  },
  {
    id: "lipstick-thoi-ruby-do",
    name: "Son Thỏi Ruby Đỏ",
    price: 215_000,
    stock: 12,
    colors: ["Đỏ"],
    tags: ["son thoi ruby do", "son thoi"],
  },
];

const GENERATOR_BASE_NAMES = [
  "Son Ruby",
  "Son Velvet",
  "Son Kem Lì",
  "Son Tint",
  "Son Bóng",
  "Son Kem",
  "Son Thỏi",
  "Son Mini",
];

const GENERATOR_COLORS = ["đỏ", "cam", "hồng", "hồng đất", "đỏ đậm", "đỏ cherry", "nude"];
const GENERATOR_FINISHES = ["matte", "velvet", "glossy", "satin", "mini", "full size"];
const GENERATOR_SERIES = ["Ruby", "Velvet", "Kem", "Tint", "Glow"];

function hashMix(seed: number, index: number, slot: number): number {
  return (seed ^ (index * 2_654_435_761) ^ (slot * 2_246_822_519)) >>> 0;
}

function pick<T>(seed: number, index: number, slot: number, items: readonly T[]): T {
  return items[hashMix(seed, index, slot) % items.length];
}

function capitalizeWords(value: string): string {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function curatedToProduct(spec: LipstickSeedSpec): CatalogProduct {
  return {
    id: spec.id,
    name: spec.name,
    category: "lipstick",
    description: `${spec.name} — curated lipstick for product-understanding tests.`,
    price: spec.price,
    stock: spec.stock,
    colors: spec.colors,
    sizes: [],
    imageUrl: `/products/images/${spec.id}.svg`,
    productUrl: `/products/${spec.id}`,
    arEffectType: "lipstick",
    tags: [...spec.tags, "son", "lipstick", "makeup"],
    sellingPoints: ["Curated lipstick", "Product understanding test"],
  };
}

function generatedLipstick(sequence: number, seed: number): CatalogProduct {
  const baseName = pick(seed, sequence, 1, GENERATOR_BASE_NAMES);
  const color = pick(seed, sequence, 2, GENERATOR_COLORS);
  const finish = pick(seed, sequence, 3, GENERATOR_FINISHES);
  const series = pick(seed, sequence, 4, GENERATOR_SERIES);
  const name = `${baseName} ${capitalizeWords(color)} ${capitalizeWords(finish)}`;
  const id = `lipstick-gen-${String(sequence).padStart(4, "0")}`;
  const price = 89_000 + (hashMix(seed, sequence, 5) % 16) * 10_000;
  const stock = 5 + (hashMix(seed, sequence, 6) % 40);

  return {
    id,
    name,
    category: "lipstick",
    description: `${series} ${name} — generated lipstick SKU for ambiguity stress tests.`,
    price,
    stock,
    colors: [capitalizeWords(color)],
    sizes: [],
    imageUrl: `/products/images/${id}.svg`,
    productUrl: `/products/${id}`,
    arEffectType: "lipstick",
    tags: [
      "son",
      "lipstick",
      "makeup",
      baseName.toLowerCase(),
      color,
      finish,
      series.toLowerCase(),
    ],
    sellingPoints: ["Generated lipstick catalog"],
  };
}

export type GenerateLipstickCatalogOptions = {
  lipstickCount?: number;
  totalCount?: number;
  seed?: number;
  includeFiller?: boolean;
};

export function generateLipstickHeavyCatalog(
  options: GenerateLipstickCatalogOptions = {},
): CatalogProduct[] {
  const lipstickCount = options.lipstickCount ?? LIPSTICK_COUNT;
  const seed = options.seed ?? 42;
  const includeFiller = options.includeFiller ?? true;
  const totalCount = options.totalCount ?? (includeFiller ? 1000 : lipstickCount);

  const catalog: CatalogProduct[] = LIPSTICK_CURATED_SPECS.map(curatedToProduct);
  const usedIds = new Set(catalog.map((product) => product.id));
  let sequence = 0;

  while (catalog.length < lipstickCount) {
    const product = generatedLipstick(sequence, seed);
    sequence += 1;
    if (!usedIds.has(product.id)) {
      usedIds.add(product.id);
      catalog.push(product);
    }
  }

  if (!includeFiller || catalog.length >= totalCount) {
    return catalog.slice(0, totalCount);
  }

  const filler = generateDummyCatalog({ count: totalCount, seed }).filter(
    (product) => product.category !== "lipstick" && !usedIds.has(product.id),
  );

  return [...catalog, ...filler].slice(0, totalCount);
}

export function findLipstickCatalogProduct(
  catalog: CatalogProduct[],
  productId: string,
): CatalogProduct {
  const product = catalog.find((entry) => entry.id === productId);
  if (!product) {
    throw new Error(`Missing lipstick catalog product: ${productId}`);
  }
  return product;
}
