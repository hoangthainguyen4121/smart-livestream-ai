import type { ImageSignature } from "./types";

const SAMPLE_WIDTH = 64;
const SAMPLE_HEIGHT = 64;
const DHASH_WIDTH = 9;
const DHASH_HEIGHT = 8;
const COLOR_BINS = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toGrayscaleMatrix(
  imageData: ImageData,
  width: number,
  height: number,
): number[][] {
  const matrix: number[][] = [];
  const sourceWidth = imageData.width;
  const sourceHeight = imageData.height;

  for (let row = 0; row < height; row += 1) {
    const rowValues: number[] = [];
    const sourceY = Math.floor((row / height) * sourceHeight);
    for (let column = 0; column < width; column += 1) {
      const sourceX = Math.floor((column / width) * sourceWidth);
      const index = (sourceY * sourceWidth + sourceX) * 4;
      const red = imageData.data[index] ?? 0;
      const green = imageData.data[index + 1] ?? 0;
      const blue = imageData.data[index + 2] ?? 0;
      rowValues.push(Math.round(red * 0.299 + green * 0.587 + blue * 0.114));
    }
    matrix.push(rowValues);
  }

  return matrix;
}

export function computeDifferenceHash(grayscale: number[][]): string {
  const bits: string[] = [];
  for (let row = 0; row < DHASH_HEIGHT; row += 1) {
    for (let column = 0; column < DHASH_WIDTH - 1; column += 1) {
      const left = grayscale[row]?.[column] ?? 0;
      const right = grayscale[row]?.[column + 1] ?? 0;
      bits.push(left > right ? "1" : "0");
    }
  }
  return bits.join("");
}

export function computeColorHistogram(imageData: ImageData): number[] {
  const bins = new Array(COLOR_BINS * 3).fill(0);

  for (let index = 0; index < imageData.data.length; index += 4) {
    const red = imageData.data[index] ?? 0;
    const green = imageData.data[index + 1] ?? 0;
    const blue = imageData.data[index + 2] ?? 0;
    bins[Math.floor(red / 32)] += 1;
    bins[COLOR_BINS + Math.floor(green / 32)] += 1;
    bins[COLOR_BINS * 2 + Math.floor(blue / 32)] += 1;
  }

  const total = bins.reduce((sum, value) => sum + value, 0) || 1;
  return bins.map((value) => value / total);
}

export function computeImageSignature(imageData: ImageData): ImageSignature {
  const grayscale = toGrayscaleMatrix(imageData, SAMPLE_WIDTH, SAMPLE_HEIGHT);
  return {
    dHash: computeDifferenceHash(grayscale),
    colorHistogram: computeColorHistogram(imageData),
  };
}

export function hashSimilarity(left: string, right: string): number {
  if (!left || !right || left.length !== right.length) {
    return 0;
  }

  let matches = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] === right[index]) {
      matches += 1;
    }
  }
  return matches / left.length;
}

export function histogramSimilarity(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  if (length === 0) {
    return 0;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < length; index += 1) {
    dot += (left[index] ?? 0) * (right[index] ?? 0);
    leftNorm += (left[index] ?? 0) ** 2;
    rightNorm += (right[index] ?? 0) ** 2;
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }

  return clamp(dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm)), 0, 1);
}

export function compareImageSignatures(left: ImageSignature, right: ImageSignature): number {
  const hashScore = hashSimilarity(left.dHash, right.dHash);
  const colorScore = histogramSimilarity(left.colorHistogram, right.colorHistogram);
  return clamp(hashScore * 0.6 + colorScore * 0.4, 0, 1);
}
