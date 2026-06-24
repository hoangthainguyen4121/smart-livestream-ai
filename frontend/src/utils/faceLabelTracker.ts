import type { BoundingBox } from "../api/inference";
import type { DisplayFace, DisplayLabelAnchor } from "./overlayMapping";
import { faceToLabelAnchor } from "./overlayMapping";


const SMOOTH_ALPHA = 0.85;
const SNAP_DISTANCE_PX = 40;
const IDENTITY_GRACE_MS = 2500;
const LOCAL_FACE_MISS_MS = 1200;
const MIN_RECOGNITION_CONFIDENCE = 0.45;
const DETECTING_LABEL = "Detecting...";


export type FaceLabelTrackerDebug = {
  identityUsername: string | null;
  identitySimilarity: number | null;
  identityAgeMs: number;
  localFaceVisible: boolean;
  usingBackendFallback: boolean;
};


export class FaceLabelTracker {
  private x = 0;
  private y = 0;
  private hasPosition = false;
  private localFaceAt = 0;
  private localBbox: BoundingBox | null = null;
  private usingBackendFallback = false;
  private username: string | null = null;
  private similarity: number | null = null;
  private lastIdentityAt = 0;
  private lastDebug: FaceLabelTrackerDebug = {
    identityUsername: null,
    identitySimilarity: null,
    identityAgeMs: 0,
    localFaceVisible: false,
    usingBackendFallback: false,
  };

  reset(): void {
    this.x = 0;
    this.y = 0;
    this.hasPosition = false;
    this.localFaceAt = 0;
    this.localBbox = null;
    this.usingBackendFallback = false;
    this.username = null;
    this.similarity = null;
    this.lastIdentityAt = 0;
    this.lastDebug = {
      identityUsername: null,
      identitySimilarity: null,
      identityAgeMs: 0,
      localFaceVisible: false,
      usingBackendFallback: false,
    };
  }

  getDebugSnapshot(): FaceLabelTrackerDebug {
    return this.lastDebug;
  }

  getLocalBbox(): BoundingBox | null {
    return this.localBbox;
  }

  updateLocalFace(bbox: BoundingBox, now: number, fromBackendFallback = false): void {
    const anchor = faceToLabelAnchor({ ...createFaceStub(bbox), bbox });
    this.localFaceAt = now;
    this.localBbox = bbox;
    this.usingBackendFallback = fromBackendFallback;
    this.smoothToward(anchor.x, anchor.y);
  }

  applyIdentity(faces: DisplayFace[], now: number): void {
    const knownFaces = faces.filter(
      (face) =>
        face.is_known &&
        face.similarity !== null &&
        face.similarity >= MIN_RECOGNITION_CONFIDENCE,
    );
    const primaryKnown = pickPrimaryFace(knownFaces);

    if (primaryKnown) {
      this.username = primaryKnown.label;
      this.similarity = primaryKnown.similarity;
      this.lastIdentityAt = now;
    }
  }

  applyBackendFallbackPosition(faces: DisplayFace[], now: number): void {
    const primaryFace = pickPrimaryFace(faces);
    if (!primaryFace) {
      return;
    }

    this.updateLocalFace(primaryFace.bbox, now, true);
  }

  tick(now: number): DisplayLabelAnchor[] {
    const localFaceVisible = now - this.localFaceAt <= LOCAL_FACE_MISS_MS;
    const identityAgeMs = this.lastIdentityAt > 0 ? now - this.lastIdentityAt : 0;
    const hasRecentIdentity =
      this.username !== null && identityAgeMs <= IDENTITY_GRACE_MS;

    this.lastDebug = {
      identityUsername: this.username,
      identitySimilarity: this.similarity,
      identityAgeMs,
      localFaceVisible,
      usingBackendFallback: this.usingBackendFallback,
    };

    if (!localFaceVisible || !this.hasPosition) {
      return [];
    }

    const label = hasRecentIdentity
      ? this.username
      : localFaceVisible
        ? DETECTING_LABEL
        : null;
    if (!label) {
      return [];
    }

    return [
      {
        x: this.x,
        y: this.y,
        label,
        is_known: label !== DETECTING_LABEL,
        similarity: label === DETECTING_LABEL ? null : this.similarity,
        bbox: this.localBbox ?? {
          x1: this.x,
          y1: this.y,
          x2: this.x,
          y2: this.y,
        },
      },
    ];
  }

  private smoothToward(targetX: number, targetY: number): void {
    if (!this.hasPosition) {
      this.x = targetX;
      this.y = targetY;
      this.hasPosition = true;
      return;
    }

    const deltaX = targetX - this.x;
    const deltaY = targetY - this.y;
    const distance = Math.hypot(deltaX, deltaY);
    if (distance > SNAP_DISTANCE_PX) {
      this.x = targetX;
      this.y = targetY;
      return;
    }

    this.x += deltaX * SMOOTH_ALPHA;
    this.y += deltaY * SMOOTH_ALPHA;
  }
}

function createFaceStub(bbox: BoundingBox): DisplayFace {
  return {
    label: "",
    similarity: null,
    is_known: false,
    bbox,
  };
}

function pickPrimaryFace(faces: DisplayFace[]): DisplayFace | null {
  if (faces.length === 0) {
    return null;
  }

  return faces.reduce((best, face) => {
    const bestArea = bboxArea(best.bbox);
    const faceArea = bboxArea(face.bbox);
    return faceArea > bestArea ? face : best;
  });
}

function bboxArea(bbox: DisplayFace["bbox"]): number {
  return Math.max(0, bbox.x2 - bbox.x1) * Math.max(0, bbox.y2 - bbox.y1);
}
