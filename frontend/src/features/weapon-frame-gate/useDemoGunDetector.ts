import { useEffect, useMemo, useState } from "react";

import { fetchFirearmOnnxStatus, type FirearmOnnxStatusResponse } from "../../api/firearmOnnxDetector";
import {
  fetchFirearmYoloxStatus,
  type FirearmYoloxStatusResponse,
} from "../../api/firearmYoloxDetector";
import { fetchWeaponStatus } from "../../api/weaponDetector";
import {
  isFirearmOnnxUiEnabled,
  isFirearmYoloxUiEnabled,
  isWeaponDinoUiEnabled,
  resolveGunDetectorSelection,
  type GunDetectorSelection,
} from "./gunDetectorSelection";
import { useWeaponFrameGate, type WeaponFrameGateView } from "./useWeaponFrameGate";

export type DemoGunDetectorView = WeaponFrameGateView & {
  selection: GunDetectorSelection;
  firearmStatus: FirearmOnnxStatusResponse | null;
  yoloxStatus: FirearmYoloxStatusResponse | null;
};

/**
 * DemoPage gun path: Subh775 ONNX → optional YOLOX harness → Grounding DINO → unavailable.
 * MVP primary is Subh775 (@0.65). YOLOX stays OFF unless research harness flag is on.
 * Never auto-terminates (weapon gate autoTerminates is always false).
 */
export function useDemoGunDetector(options: {
  enabled: boolean;
  isLive: boolean;
  getCanvasElement: () => HTMLCanvasElement | null;
}): DemoGunDetectorView {
  const yoloxUiEnabled = useMemo(() => isFirearmYoloxUiEnabled(), []);
  const firearmUiEnabled = useMemo(() => isFirearmOnnxUiEnabled(), []);
  const dinoUiEnabled = useMemo(() => isWeaponDinoUiEnabled(), []);
  const [yoloxStatus, setYoloxStatus] = useState<FirearmYoloxStatusResponse | null>(null);
  const [firearmStatus, setFirearmStatus] = useState<FirearmOnnxStatusResponse | null>(null);
  const [dinoBackendEnabled, setDinoBackendEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (yoloxUiEnabled) {
        const status = await fetchFirearmYoloxStatus();
        if (!cancelled) {
          setYoloxStatus(status);
        }
      } else if (!cancelled) {
        setYoloxStatus(null);
      }
      if (firearmUiEnabled) {
        const status = await fetchFirearmOnnxStatus();
        if (!cancelled) {
          setFirearmStatus(status);
        }
      } else if (!cancelled) {
        setFirearmStatus(null);
      }
      if (dinoUiEnabled) {
        const status = await fetchWeaponStatus();
        if (!cancelled) {
          setDinoBackendEnabled(status ? status.enabled : null);
        }
      } else if (!cancelled) {
        setDinoBackendEnabled(null);
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [yoloxUiEnabled, firearmUiEnabled, dinoUiEnabled]);

  const selection = useMemo(
    () =>
      resolveGunDetectorSelection({
        yoloxUiEnabled,
        yoloxStatus,
        firearmUiEnabled,
        firearmStatus,
        dinoUiEnabled,
        dinoBackendEnabled,
      }),
    [
      yoloxUiEnabled,
      yoloxStatus,
      firearmUiEnabled,
      firearmStatus,
      dinoUiEnabled,
      dinoBackendEnabled,
    ],
  );

  const gate = useWeaponFrameGate({
    enabled: options.enabled && selection.backend !== null,
    isLive: options.isLive,
    getCanvasElement: options.getCanvasElement,
    backend: selection.backend ?? "grounding_dino",
    inferenceIntervalMs: selection.inferenceIntervalMs,
    minScore: selection.minScore,
    // Local thesis path must run even if only a firearm Vite flag is on.
    forceUiEnabled: selection.backend !== null,
  });

  return {
    ...gate,
    selection,
    firearmStatus,
    yoloxStatus,
  };
}
