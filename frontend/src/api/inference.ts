import { getApiBaseUrl } from "./config";

export type BoundingBox = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type FaceInferenceResult = {
  label: string;
  similarity: number | null;
  is_known: boolean;
  bbox: BoundingBox;
};

export type InferenceFrameResponse = {
  frame_width: number;
  frame_height: number;
  primary_username: string;
  faces: FaceInferenceResult[];
  gestures: string[];
  gesture_labels: string[];
  processing_ms: number;
  frame_id?: number | null;
  gesture_debug?: GestureDebugInfo[];
};

export type GestureDebugInfo = {
  hand_open: boolean;
  wrist_dx: number;
  direction_changes: number;
  amplitude: number;
  detected_gesture?: string | null;
};

export type InferenceFrameRequestPayload = {
  frame: string;
  frame_id: number;
  sent_at_ms: number;
};

type SubmitInferenceFrameOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
  frameId: number;
  sentAtMs: number;
};

function getInferenceBaseUrl(): string {
  return `${getApiBaseUrl()}/api/inference`;
}

export async function submitInferenceFrame(
  frame: string,
  options: SubmitInferenceFrameOptions,
): Promise<InferenceFrameResponse> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 15000;
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      options.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }

  try {
    const response = await fetch(`${getInferenceBaseUrl()}/frame`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        frame,
        frame_id: options.frameId,
        sent_at_ms: options.sentAtMs,
      } satisfies InferenceFrameRequestPayload),
      signal: controller.signal,
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.detail ?? "Inference request failed.");
    }

    return payload as InferenceFrameResponse;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Inference request timed out.");
    }
    if (error instanceof TypeError) {
      throw new Error("Backend unavailable. Check that the API server is running.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function resetInferenceState(): Promise<void> {
  const response = await fetch(`${getInferenceBaseUrl()}/reset`, {
    method: "POST",
  });

  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload.detail ?? "Unable to reset inference state.");
  }
}
