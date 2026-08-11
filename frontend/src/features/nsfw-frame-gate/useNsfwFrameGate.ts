import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { classifyNsfwFrame, fetchNsfwStatus, type NsfwStatusResponse } from "../../api/nsfwFrameGate";
import {
  appendNsfwEvidence,
  evaluateNsfwGate,
  isNsfwFrameGateUiEnabled,
  pruneNsfwEvidence,
  readNsfwGateConfig,
  subsampleCanvasToJpegDataUrl,
  type NsfwEvidenceHit,
  type NsfwGateResult,
} from "./nsfwFrameGatePolicy";

type UseNsfwFrameGateOptions = {
  enabled: boolean;
  isLive: boolean;
  getCanvasElement: () => HTMLCanvasElement | null;
  /** Bump to clear temporal evidence (seek / video change). */
  resetEpoch?: number;
};

export type NsfwFrameGateView = {
  uiEnabled: boolean;
  backendEnabled: boolean | null;
  ready: boolean;
  status: NsfwStatusResponse | null;
  result: NsfwGateResult;
  lastLabel: string | null;
  lastNsfwScore: number | null;
  lastNormalScore: number | null;
  lastInferenceMs: number | null;
  errorMessage: string | null;
  inFlight: boolean;
  analyzeCurrentFrame: () => Promise<void>;
  resetEvidence: () => void;
};

const EMPTY_RESULT: NsfwGateResult = {
  action: "none",
  evidenceCount: 0,
  requiredHits: 2,
  latestNsfwScore: null,
  hits: [],
};

export function useNsfwFrameGate(options: UseNsfwFrameGateOptions): NsfwFrameGateView {
  const uiEnabled = useMemo(() => isNsfwFrameGateUiEnabled(), []);
  const config = useMemo(() => readNsfwGateConfig(), []);
  const [status, setStatus] = useState<NsfwStatusResponse | null>(null);
  const [result, setResult] = useState<NsfwGateResult>({
    ...EMPTY_RESULT,
    requiredHits: config.requiredHits,
  });
  const [lastLabel, setLastLabel] = useState<string | null>(null);
  const [lastNsfwScore, setLastNsfwScore] = useState<number | null>(null);
  const [lastNormalScore, setLastNormalScore] = useState<number | null>(null);
  const [lastInferenceMs, setLastInferenceMs] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [inFlight, setInFlight] = useState(false);

  const hitsRef = useRef<NsfwEvidenceHit[]>([]);
  const inFlightRef = useRef(false);
  const getCanvasElementRef = useRef(options.getCanvasElement);
  getCanvasElementRef.current = options.getCanvasElement;
  const configRef = useRef(config);
  configRef.current = config;

  const active = uiEnabled && options.enabled && options.isLive;

  const resetEvidence = useCallback(() => {
    hitsRef.current = [];
    setResult({ ...EMPTY_RESULT, requiredHits: configRef.current.requiredHits });
    setLastLabel(null);
    setLastNsfwScore(null);
    setLastNormalScore(null);
    setLastInferenceMs(null);
    setErrorMessage(null);
  }, []);

  useEffect(() => {
    resetEvidence();
  }, [options.resetEpoch, resetEvidence]);

  useEffect(() => {
    if (!uiEnabled) {
      setStatus(null);
      return undefined;
    }

    let cancelled = false;
    void fetchNsfwStatus().then((payload) => {
      if (!cancelled) {
        setStatus(payload);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [uiEnabled]);

  const runClassify = useCallback(async () => {
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

    try {
      const response = await classifyNsfwFrame(dataUrl, clientTimestampMs);
      setLastLabel(response.label);
      setLastNsfwScore(response.nsfw_score);
      setLastNormalScore(response.normal_score);
      setLastInferenceMs(response.inference_ms);
      setErrorMessage(null);

      const hit: NsfwEvidenceHit | null =
        response.is_nsfw || response.nsfw_score >= cfg.minScore
          ? {
              atMs: clientTimestampMs,
              nsfwScore: response.nsfw_score,
              label: response.label,
            }
          : null;

      hitsRef.current = appendNsfwEvidence(hitsRef.current, hit, cfg.windowMs);
      setResult(evaluateNsfwGate(hitsRef.current, cfg));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "nsfw_classify_failed";
      setErrorMessage(message);
      hitsRef.current = pruneNsfwEvidence(hitsRef.current, Date.now(), cfg.windowMs);
      setResult(evaluateNsfwGate(hitsRef.current, cfg));
    } finally {
      inFlightRef.current = false;
      setInFlight(false);
    }
  }, []);

  useEffect(() => {
    if (!active) {
      hitsRef.current = [];
      setResult({ ...EMPTY_RESULT, requiredHits: config.requiredHits });
      setLastLabel(null);
      setLastNsfwScore(null);
      setLastNormalScore(null);
      setLastInferenceMs(null);
      setErrorMessage(null);
      inFlightRef.current = false;
      setInFlight(false);
      return undefined;
    }

    if (status && !status.enabled) {
      setErrorMessage("nsfw_frame_gate_disabled");
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      if (inFlightRef.current) {
        return;
      }
      void runClassify();
    }, config.inferenceIntervalMs);

    const pruneId = window.setInterval(() => {
      hitsRef.current = pruneNsfwEvidence(hitsRef.current, Date.now(), config.windowMs);
      setResult(evaluateNsfwGate(hitsRef.current, config));
    }, 500);

    return () => {
      window.clearInterval(intervalId);
      window.clearInterval(pruneId);
    };
  }, [active, config, status, runClassify]);

  return {
    uiEnabled,
    backendEnabled: status ? status.enabled : null,
    ready: Boolean(status?.ready),
    status,
    result,
    lastLabel,
    lastNsfwScore,
    lastNormalScore,
    lastInferenceMs,
    errorMessage,
    inFlight,
    analyzeCurrentFrame: runClassify,
    resetEvidence,
  };
}
