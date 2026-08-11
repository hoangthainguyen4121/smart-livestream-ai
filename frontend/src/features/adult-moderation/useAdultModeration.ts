import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  classifyAdultFrame,
  fetchAdultStatus,
  type AdultClassifyResponse,
  type AdultState,
  type AdultStatusResponse,
} from "../../api/adultModeration";
import {
  appendAdultEvidence,
  evaluateAdultGate,
  isAdultModerationUiEnabled,
  pruneAdultEvidence,
  readAdultGateConfig,
  subsampleCanvasToJpegDataUrl,
  type AdultEvidenceHit,
  type AdultGateResult,
} from "./adultModerationPolicy";

type UseAdultModerationOptions = {
  enabled: boolean;
  isLive: boolean;
  getCanvasElement: () => HTMLCanvasElement | null;
  /** Bump to clear temporal evidence (seek / video change). */
  resetEpoch?: number;
};

export type AdultModerationView = {
  uiEnabled: boolean;
  backendEnabled: boolean | null;
  ready: boolean;
  status: AdultStatusResponse | null;
  result: AdultGateResult;
  lastFrameState: AdultState | null;
  lastClassify: AdultClassifyResponse | null;
  errorMessage: string | null;
  inFlight: boolean;
  analyzeCurrentFrame: () => Promise<void>;
  resetEvidence: () => void;
};

const emptyResult = (requiredHits: number): AdultGateResult => ({
  state: "SAFE",
  evidenceCount: 0,
  requiredHits,
  suggestiveEvidenceCount: 0,
  explicitEvidenceCount: 0,
  hits: [],
});

export function useAdultModeration(options: UseAdultModerationOptions): AdultModerationView {
  const uiEnabled = useMemo(() => isAdultModerationUiEnabled(), []);
  const config = useMemo(() => readAdultGateConfig(), []);
  const [status, setStatus] = useState<AdultStatusResponse | null>(null);
  const [result, setResult] = useState<AdultGateResult>(() => emptyResult(config.requiredHits));
  const [lastFrameState, setLastFrameState] = useState<AdultState | null>(null);
  const [lastClassify, setLastClassify] = useState<AdultClassifyResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [inFlight, setInFlight] = useState(false);

  const hitsRef = useRef<AdultEvidenceHit[]>([]);
  const inFlightRef = useRef(false);
  const getCanvasElementRef = useRef(options.getCanvasElement);
  getCanvasElementRef.current = options.getCanvasElement;
  const configRef = useRef(config);
  configRef.current = config;

  const active = uiEnabled && options.enabled && options.isLive;

  const resetEvidence = useCallback(() => {
    hitsRef.current = [];
    setResult(emptyResult(configRef.current.requiredHits));
    setLastFrameState(null);
    setLastClassify(null);
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
    void fetchAdultStatus().then((payload) => {
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
      const response = await classifyAdultFrame(dataUrl, clientTimestampMs);
      setLastClassify(response);
      setLastFrameState(response.state);
      setErrorMessage(null);

      const hit: AdultEvidenceHit | null =
        response.state === "SAFE"
          ? null
          : {
              atMs: clientTimestampMs,
              state: response.state,
              score:
                response.suggestive.score ??
                response.falconsai.nsfw_score ??
                null,
              label: response.suggestive.label ?? response.falconsai.label ?? null,
            };

      hitsRef.current = appendAdultEvidence(hitsRef.current, hit, cfg.windowMs);
      setResult(
        evaluateAdultGate(hitsRef.current, {
          requiredHits: cfg.requiredHits,
          explicitRequiredHits: cfg.explicitRequiredHits,
        }),
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "adult_classify_failed";
      setErrorMessage(message);
      hitsRef.current = pruneAdultEvidence(hitsRef.current, Date.now(), cfg.windowMs);
      setResult(
        evaluateAdultGate(hitsRef.current, {
          requiredHits: cfg.requiredHits,
          explicitRequiredHits: cfg.explicitRequiredHits,
        }),
      );
    } finally {
      inFlightRef.current = false;
      setInFlight(false);
    }
  }, []);

  useEffect(() => {
    if (!active) {
      hitsRef.current = [];
      setResult(emptyResult(config.requiredHits));
      setLastFrameState(null);
      setLastClassify(null);
      setErrorMessage(null);
      inFlightRef.current = false;
      setInFlight(false);
      return undefined;
    }

    if (status && !status.enabled) {
      setErrorMessage("adult_moderation_disabled");
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      if (inFlightRef.current) {
        return;
      }
      void runClassify();
    }, config.inferenceIntervalMs);

    const pruneId = window.setInterval(() => {
      hitsRef.current = pruneAdultEvidence(hitsRef.current, Date.now(), config.windowMs);
      setResult(
        evaluateAdultGate(hitsRef.current, {
          requiredHits: config.requiredHits,
          explicitRequiredHits: config.explicitRequiredHits,
        }),
      );
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
    lastFrameState,
    lastClassify,
    errorMessage,
    inFlight,
    analyzeCurrentFrame: runClassify,
    resetEvidence,
  };
}
