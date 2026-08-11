import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  detectFirearmOnnxFrame,
  fetchFirearmOnnxStatus,
} from "../../api/firearmOnnxDetector";
import {
  detectFirearmYoloxFrame,
  fetchFirearmYoloxStatus,
} from "../../api/firearmYoloxDetector";
import {
  detectWeaponFrame,
  fetchWeaponStatus,
  type WeaponDetectionDto,
  type WeaponStatusResponse,
} from "../../api/weaponDetector";
import {
  appendWeaponEvidence,
  evaluateWeaponGate,
  isWeaponFrameGateUiEnabled,
  pickTopGunHit,
  pruneWeaponEvidence,
  readWeaponGateConfig,
  shouldSkipBusySample,
  subsampleCanvasToJpegDataUrl,
  type GunDetectorBackend,
  type WeaponEvidenceHit,
  type WeaponGateResult,
} from "./weaponFrameGatePolicy";

type UseWeaponFrameGateOptions = {
  enabled: boolean;
  isLive: boolean;
  getCanvasElement: () => HTMLCanvasElement | null;
  /** Bump to clear temporal evidence (seek / video change). */
  resetEpoch?: number;
  /** Override sampling interval (ms). */
  inferenceIntervalMs?: number;
  /** CV-test A/B: grounding_dino (default) or firearm_onnx. */
  backend?: GunDetectorBackend;
  /** Override gun-family min score (ONNX default policy often 0.40). */
  minScore?: number;
  /**
   * DEV harness: run even when VITE_WEAPON_DETECTOR_ENABLED is off
   * (still requires matching backend enable flag).
   */
  forceUiEnabled?: boolean;
};

export type WeaponFrameGateView = {
  uiEnabled: boolean;
  backendEnabled: boolean | null;
  ready: boolean;
  status: WeaponStatusResponse | null;
  result: WeaponGateResult;
  lastDetections: WeaponDetectionDto[];
  /** Max gun score from last inference (may be below threshold). */
  lastRawScore: number | null;
  lastConfThreshold: number | null;
  lastInferenceMs: number | null;
  lastStartedAtMs: number | null;
  lastCompletedAtMs: number | null;
  errorMessage: string | null;
  inFlight: boolean;
  skippedBusyCount: number;
  completedSamples: number;
  scanCurrentFrame: () => Promise<void>;
  resetEvidence: () => void;
};

const EMPTY_RESULT: WeaponGateResult = {
  state: "safe",
  action: "safe",
  evidenceCount: 0,
  requiredHits: 2,
  latestScore: null,
  latestLabel: null,
  hits: [],
  autoTerminates: false,
};

export function useWeaponFrameGate(options: UseWeaponFrameGateOptions): WeaponFrameGateView {
  const backend = options.backend ?? "grounding_dino";
  const uiEnabled = useMemo(
    () => Boolean(options.forceUiEnabled) || isWeaponFrameGateUiEnabled(),
    [options.forceUiEnabled],
  );
  const baseConfig = useMemo(() => readWeaponGateConfig(), []);
  const config = useMemo(
    () => ({
      ...baseConfig,
      inferenceIntervalMs:
        options.inferenceIntervalMs ?? baseConfig.inferenceIntervalMs,
      minScore: options.minScore ?? baseConfig.minScore,
    }),
    [baseConfig, options.inferenceIntervalMs, options.minScore],
  );
  const [status, setStatus] = useState<WeaponStatusResponse | null>(null);
  const [result, setResult] = useState<WeaponGateResult>({
    ...EMPTY_RESULT,
    requiredHits: config.requiredHits,
  });
  const [lastDetections, setLastDetections] = useState<WeaponDetectionDto[]>([]);
  const [lastRawScore, setLastRawScore] = useState<number | null>(null);
  const [lastConfThreshold, setLastConfThreshold] = useState<number | null>(null);
  const [lastInferenceMs, setLastInferenceMs] = useState<number | null>(null);
  const [lastStartedAtMs, setLastStartedAtMs] = useState<number | null>(null);
  const [lastCompletedAtMs, setLastCompletedAtMs] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [inFlight, setInFlight] = useState(false);
  const [skippedBusyCount, setSkippedBusyCount] = useState(0);
  const [completedSamples, setCompletedSamples] = useState(0);

  const hitsRef = useRef<WeaponEvidenceHit[]>([]);
  const inFlightRef = useRef(false);
  const getCanvasElementRef = useRef(options.getCanvasElement);
  getCanvasElementRef.current = options.getCanvasElement;
  const configRef = useRef(config);
  configRef.current = config;

  const active = uiEnabled && options.enabled && options.isLive;

  const resetEvidence = useCallback(() => {
    hitsRef.current = [];
    setResult({ ...EMPTY_RESULT, requiredHits: configRef.current.requiredHits });
    setLastDetections([]);
    setLastInferenceMs(null);
    setLastStartedAtMs(null);
    setLastCompletedAtMs(null);
    setErrorMessage(null);
  }, []);

  useEffect(() => {
    resetEvidence();
  }, [options.resetEpoch, resetEvidence, backend]);

  useEffect(() => {
    if (!uiEnabled) {
      setStatus(null);
      return undefined;
    }

    let cancelled = false;
    const load = async () => {
      if (backend === "firearm_onnx") {
        const payload = await fetchFirearmOnnxStatus();
        if (cancelled || !payload) {
          if (!cancelled) {
            setStatus(null);
          }
          return;
        }
        // Adapt ONNX status into the weapon status shape used by the gate UI.
        setStatus({
          enabled: payload.enabled,
          ready: payload.ready,
          model_id: payload.model_id,
          model_revision: payload.model_revision,
          loaded_model_id: payload.loaded_onnx_path,
          loaded_revision: payload.model_revision,
          cache_dir: payload.cache_dir,
          cache_dir_configured: payload.cache_dir_configured,
          architecture: payload.architecture,
          license: payload.license,
          prompt: "firearm_onnx:Gun",
          normalized_labels: payload.classes,
          stores_violation_images: payload.stores_violation_images,
          auto_terminates_session: payload.auto_terminates_session,
          load_error: payload.load_error,
          dependencies_installed: payload.dependencies_installed,
          device: payload.runtime,
        } satisfies WeaponStatusResponse);
        return;
      }

      if (backend === "firearm_yolox") {
        const payload = await fetchFirearmYoloxStatus();
        if (cancelled || !payload) {
          if (!cancelled) {
            setStatus(null);
          }
          return;
        }
        setStatus({
          enabled: payload.enabled,
          ready: payload.ready,
          model_id: payload.model_id,
          model_revision: "hardneg_finetune",
          loaded_model_id: payload.model_id,
          loaded_revision: "hardneg_finetune",
          cache_dir: null,
          cache_dir_configured: true,
          architecture: payload.architecture,
          license: payload.license,
          prompt: "firearm_yolox:gun",
          normalized_labels: ["gun"],
          stores_violation_images: false,
          auto_terminates_session: false,
          load_error: payload.load_error,
          dependencies_installed: payload.dependencies_installed,
          device: "onnxruntime",
        } satisfies WeaponStatusResponse);
        return;
      }

      const payload = await fetchWeaponStatus();
      if (!cancelled) {
        setStatus(payload);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [uiEnabled, backend]);

  const runDetect = useCallback(async () => {
    if (inFlightRef.current) {
      return;
    }
    const canvas = getCanvasElementRef.current();
    if (!canvas) {
      return;
    }
    const cfg = configRef.current;
    const dataUrl = subsampleCanvasToJpegDataUrl(canvas, {
      maxEdge: cfg.maxEdge,
      jpegQuality: cfg.jpegQuality,
    });
    if (!dataUrl) {
      return;
    }

    inFlightRef.current = true;
    setInFlight(true);
    const clientTimestampMs = Date.now();
    setLastStartedAtMs(clientTimestampMs);

    try {
      const response =
        backend === "firearm_onnx"
          ? await detectFirearmOnnxFrame(dataUrl, clientTimestampMs)
          : backend === "firearm_yolox"
            ? await detectFirearmYoloxFrame(dataUrl, clientTimestampMs)
            : await detectWeaponFrame(dataUrl, clientTimestampMs);
      setLastDetections(response.detections);
      const raw =
        "top_score" in response && typeof response.top_score === "number"
          ? response.top_score
          : response.detections[0]?.score ?? null;
      setLastRawScore(raw);
      setLastConfThreshold(
        "conf_threshold" in response && typeof response.conf_threshold === "number"
          ? response.conf_threshold
          : cfg.minScore,
      );
      setLastInferenceMs(response.inference_ms);
      setLastCompletedAtMs(Date.now());
      setErrorMessage(null);
      setCompletedSamples((value) => value + 1);

      const hit = pickTopGunHit(response.detections, cfg.minScore, clientTimestampMs);
      hitsRef.current = appendWeaponEvidence(hitsRef.current, hit, cfg.windowMs);
      setResult(evaluateWeaponGate(hitsRef.current, cfg));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "weapon_detect_failed";
      setErrorMessage(message);
      hitsRef.current = pruneWeaponEvidence(hitsRef.current, Date.now(), cfg.windowMs);
      setResult(evaluateWeaponGate(hitsRef.current, cfg));
    } finally {
      inFlightRef.current = false;
      setInFlight(false);
    }
  }, [backend]);

  useEffect(() => {
    if (!active) {
      hitsRef.current = [];
      setResult({ ...EMPTY_RESULT, requiredHits: config.requiredHits });
      setLastDetections([]);
      setLastRawScore(null);
      setLastConfThreshold(null);
      setLastInferenceMs(null);
      setErrorMessage(null);
      inFlightRef.current = false;
      setInFlight(false);
      setSkippedBusyCount(0);
      setCompletedSamples(0);
      return undefined;
    }

    if (status && !status.enabled) {
      setErrorMessage(
        backend === "firearm_yolox"
          ? "firearm_yolox_disabled"
          : backend === "firearm_onnx"
            ? "firearm_onnx_disabled"
            : "weapon_detector_disabled",
      );
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      if (shouldSkipBusySample(inFlightRef.current)) {
        setSkippedBusyCount((value) => value + 1);
        return;
      }
      void runDetect();
    }, config.inferenceIntervalMs);

    const pruneId = window.setInterval(() => {
      hitsRef.current = pruneWeaponEvidence(hitsRef.current, Date.now(), config.windowMs);
      setResult(evaluateWeaponGate(hitsRef.current, config));
    }, 1_000);

    return () => {
      window.clearInterval(intervalId);
      window.clearInterval(pruneId);
    };
  }, [active, config, status, runDetect, backend]);

  return {
    uiEnabled,
    backendEnabled: status ? status.enabled : null,
    ready: Boolean(status?.ready),
    status,
    result,
    lastDetections,
    lastRawScore,
    lastConfThreshold,
    lastInferenceMs,
    lastStartedAtMs,
    lastCompletedAtMs,
    errorMessage,
    inFlight,
    skippedBusyCount,
    completedSamples,
    scanCurrentFrame: runDetect,
    resetEvidence,
  };
}
