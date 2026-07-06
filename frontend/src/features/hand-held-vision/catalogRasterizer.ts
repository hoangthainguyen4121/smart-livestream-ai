import type { CatalogProduct } from "../product-catalog/productCatalogTypes";

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load image: ${url}`));
    image.src = url;
  });
}

function imageToPngBase64(image: HTMLImageElement, size = 224): string {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to acquire canvas context for catalog export.");
  }
  if (image.naturalWidth === 0 || image.naturalHeight === 0) {
    throw new Error(`Invalid catalog image dimensions for ${image.src}`);
  }
  context.drawImage(image, 0, 0, size, size);
  return canvas.toDataURL("image/png");
}

export type CatalogRasterItem = {
  id: string;
  name: string;
  imageBase64: string;
};

export async function rasterizeCatalogForVision(
  catalog: CatalogProduct[],
): Promise<CatalogRasterItem[]> {
  const items = await Promise.all(
    catalog.map(async (product) => {
      if (!product.imageUrl) {
        return null;
      }
      try {
        const image = await loadImage(product.imageUrl);
        return {
          id: product.id,
          name: product.name,
          imageBase64: imageToPngBase64(image),
        };
      } catch {
        return null;
      }
    }),
  );

  return items.filter((entry): entry is CatalogRasterItem => entry !== null);
}
