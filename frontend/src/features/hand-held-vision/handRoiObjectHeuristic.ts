export type HandObjectPresenceResult = {
  hasObject: boolean;
  objectScore: number;
  skinRatio: number;
  centerEdgeDensity: number;
};

function isLikelySkinPixel(red: number, green: number, blue: number): boolean {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  if (max < 40) {
    return false;
  }
  return (
    red > 60 &&
    green > 30 &&
    blue > 15 &&
    red > green &&
    red - green > 10 &&
    max - min > 12 &&
    red - blue > 12
  );
}

function grayscaleValue(red: number, green: number, blue: number): number {
  return red * 0.299 + green * 0.587 + blue * 0.114;
}

/**
 * Lightweight gate: open empty palm ≈ mostly skin + low contrast in palm center.
 * Non-skin blob or strong edges in center ≈ likely holding something.
 */
export function estimateObjectInHandCrop(imageData: ImageData): HandObjectPresenceResult {
  const { width, height, data } = imageData;
  if (width < 8 || height < 8) {
    return { hasObject: false, objectScore: 0, skinRatio: 1, centerEdgeDensity: 0 };
  }

  const centerLeft = Math.floor(width * 0.25);
  const centerRight = Math.ceil(width * 0.75);
  const centerTop = Math.floor(height * 0.25);
  const centerBottom = Math.ceil(height * 0.75);

  let skinPixels = 0;
  let totalPixels = 0;
  let centerNonSkin = 0;
  let centerPixels = 0;
  let centerEdges = 0;

  const gray: number[] = new Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const red = data[index] ?? 0;
      const green = data[index + 1] ?? 0;
      const blue = data[index + 2] ?? 0;
      const skin = isLikelySkinPixel(red, green, blue);
      totalPixels += 1;
      if (skin) {
        skinPixels += 1;
      }
      gray[y * width + x] = grayscaleValue(red, green, blue);

      if (x >= centerLeft && x < centerRight && y >= centerTop && y < centerBottom) {
        centerPixels += 1;
        if (!skin) {
          centerNonSkin += 1;
        }
      }
    }
  }

  for (let y = centerTop + 1; y < centerBottom - 1; y += 1) {
    for (let x = centerLeft + 1; x < centerRight - 1; x += 1) {
      const current = gray[y * width + x] ?? 0;
      const right = gray[y * width + x + 1] ?? 0;
      const down = gray[(y + 1) * width + x] ?? 0;
      if (Math.abs(current - right) > 22 || Math.abs(current - down) > 22) {
        centerEdges += 1;
      }
    }
  }

  const skinRatio = skinPixels / Math.max(1, totalPixels);
  const centerNonSkinRatio = centerNonSkin / Math.max(1, centerPixels);
  const centerEdgeDensity = centerEdges / Math.max(1, centerPixels);

  const objectScore = Number(
    Math.min(
      1,
      centerNonSkinRatio * 0.55 + centerEdgeDensity * 0.35 + Math.max(0, 0.72 - skinRatio) * 0.4,
    ).toFixed(3),
  );

  const hasObject =
    centerNonSkinRatio >= 0.22 ||
    (centerEdgeDensity >= 0.16 && centerNonSkinRatio >= 0.08) ||
    (skinRatio < 0.52 && objectScore >= 0.28);

  return {
    hasObject,
    objectScore,
    skinRatio: Number(skinRatio.toFixed(3)),
    centerEdgeDensity: Number(centerEdgeDensity.toFixed(3)),
  };
}
