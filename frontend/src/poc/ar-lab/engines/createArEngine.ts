import { FaceLandmarkerEngine } from "./faceLandmarkerEngine";
import { LegacyFaceMeshEngine } from "./legacyFaceMeshEngine";
import type { ArEngine, ArEngineId } from "../types";

export async function createArEngine(engineId: ArEngineId): Promise<ArEngine> {
  const engine =
    engineId === "legacy_face_mesh"
      ? new LegacyFaceMeshEngine()
      : new FaceLandmarkerEngine();

  await engine.init();
  return engine;
}

export function engineRequiresLandmarks(mode: string): boolean {
  return mode !== "raw_camera";
}
