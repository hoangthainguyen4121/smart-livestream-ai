import type { CatalogProduct } from "../product-catalog/productCatalogTypes";
import {
  compareImageSignatures,
  computeImageSignature,
} from "./imageSignature";
import type {
  CameraProductMatch,
  CatalogImageSignature,
  ImageSignature,
} from "./types";
import { MIN_CAMERA_VISION_CONFIDENCE } from "./types";

const signatureCache = new Map<string, Promise<CatalogImageSignature | null>>();

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load image: ${url}`));
    image.src = url;
  });
}

function imageToImageData(image: HTMLImageElement, size = 64): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to acquire canvas context for catalog image.");
  }
  context.drawImage(image, 0, 0, size, size);
  return context.getImageData(0, 0, size, size);
}

export async function loadCatalogImageSignature(
  product: CatalogProduct,
): Promise<CatalogImageSignature | null> {
  if (!product.imageUrl) {
    return null;
  }

  const cached = signatureCache.get(product.id);
  if (cached) {
    return cached;
  }

  const pending = (async () => {
    try {
      const image = await loadImage(product.imageUrl);
      const signature = computeImageSignature(imageToImageData(image));
      return {
        productId: product.id,
        productName: product.name,
        imageUrl: product.imageUrl,
        signature,
      };
    } catch {
      return null;
    }
  })();

  signatureCache.set(product.id, pending);
  return pending;
}

export async function preloadCatalogImageSignatures(
  catalog: CatalogProduct[],
): Promise<CatalogImageSignature[]> {
  const signatures = await Promise.all(catalog.map((product) => loadCatalogImageSignature(product)));
  return signatures.filter((entry): entry is CatalogImageSignature => entry !== null);
}

export function matchFrameAgainstCatalog(
  frameSignature: ImageSignature,
  catalogSignatures: CatalogImageSignature[],
  minimumConfidence = MIN_CAMERA_VISION_CONFIDENCE,
): CameraProductMatch | null {
  if (catalogSignatures.length === 0) {
    return null;
  }

  let best: { entry: CatalogImageSignature; score: number } | null = null;
  let secondScore = 0;

  for (const entry of catalogSignatures) {
    const score = compareImageSignatures(frameSignature, entry.signature);
    if (!best || score > best.score) {
      secondScore = best?.score ?? 0;
      best = { entry, score };
      continue;
    }
    if (score > secondScore) {
      secondScore = score;
    }
  }

  if (!best || best.score < minimumConfidence) {
    return null;
  }

  const confidence = Number(Math.min(0.98, best.score + Math.max(0, best.score - secondScore) * 0.1).toFixed(2));

  return {
    productId: best.entry.productId,
    productName: best.entry.productName,
    score: Number(best.score.toFixed(3)),
    confidence,
    source: "camera_vision",
    explanation: `Catalog image match against ${best.entry.productName} (${best.entry.imageUrl}).`,
  };
}

export function matchImageDataAgainstCatalogSignatures(
  imageData: ImageData,
  catalogSignatures: CatalogImageSignature[],
  minimumConfidence = MIN_CAMERA_VISION_CONFIDENCE,
): CameraProductMatch | null {
  const frameSignature = computeImageSignature(imageData);
  return matchFrameAgainstCatalog(frameSignature, catalogSignatures, minimumConfidence);
}

export function clearCatalogImageSignatureCache(): void {
  signatureCache.clear();
}

export function createSyntheticImageData(
  red: number,
  green: number,
  blue: number,
  width = 64,
  height = 64,
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = red;
    data[index + 1] = green;
    data[index + 2] = blue;
    data[index + 3] = 255;
  }

  if (typeof ImageData !== "undefined") {
    return new ImageData(data, width, height);
  }

  return { data, width, height } as ImageData;
}
