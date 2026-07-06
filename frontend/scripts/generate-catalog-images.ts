import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUTPUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../public/products/images");

type ProductArtSpec = {
  id: string;
  background: string;
  accent: string;
  label: string;
};

const PRODUCTS: ProductArtSpec[] = [
  { id: "glasses-a", background: "#e2e8f0", accent: "#0f172a", label: "GA" },
  { id: "glasses-urban", background: "#dbeafe", accent: "#1d4ed8", label: "GU" },
  { id: "lipstick-ruby", background: "#fee2e2", accent: "#b91c1c", label: "RB" },
  { id: "lipstick-coral", background: "#ffedd5", accent: "#ea580c", label: "CR" },
  { id: "crown-accessory", background: "#fef9c3", accent: "#ca8a04", label: "CRN" },
  { id: "bucket-hat", background: "#ecfccb", accent: "#4d7c0f", label: "BH" },
  { id: "headphones-mini", background: "#f3e8ff", accent: "#7e22ce", label: "HP" },
  { id: "sunscreen-spf50", background: "#cffafe", accent: "#0891b2", label: "SPF" },
  { id: "crossbody-basic", background: "#f5f5f4", accent: "#57534e", label: "CB" },
  { id: "oversize-tee", background: "#fafafa", accent: "#171717", label: "TEE" },
];

function buildSvg(spec: ProductArtSpec): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="224" height="224" viewBox="0 0 224 224">
  <rect width="224" height="224" fill="${spec.background}" />
  <circle cx="112" cy="92" r="56" fill="${spec.accent}" opacity="0.92" />
  <rect x="48" y="148" width="128" height="28" rx="14" fill="${spec.accent}" opacity="0.75" />
  <text x="112" y="100" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#ffffff">${spec.label}</text>
</svg>`;
}

mkdirSync(OUTPUT_DIR, { recursive: true });

for (const product of PRODUCTS) {
  writeFileSync(join(OUTPUT_DIR, `${product.id}.svg`), buildSvg(product), "utf8");
}

console.log(`Generated ${PRODUCTS.length} catalog images in ${OUTPUT_DIR}`);
