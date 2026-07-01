import { getApiBaseUrl } from "./config";

export type PoseName = "front" | "left" | "right" | "up" | "down";

export type PoseCounts = Record<PoseName, number>;

export type FaceRegistrationSession = {
  session_id: string;
  display_name: string;
  required_poses: string[];
  optional_poses: string[];
  minimum_samples: number;
  accepted_count: number;
  pose_counts: PoseCounts;
  can_complete: boolean;
};

export type FaceRegistrationSampleResponse = {
  accepted: boolean;
  reason: string;
  accepted_count: number;
  pose_counts: PoseCounts;
  can_complete: boolean;
  metrics: {
    face_count: number;
    bbox_width: number | null;
    bbox_height: number | null;
    detection_confidence: number | null;
    blur_variance: number | null;
    brightness: number | null;
    duplicate_similarity: number | null;
  };
};

export type FaceRegistrationCompleteResponse = {
  display_name: string;
  samples: number;
  embedding_file: string;
};

export class FaceRegistrationApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "FaceRegistrationApiError";
    this.status = status;
  }
}

function getFaceRegistrationBaseUrl(): string {
  return `${getApiBaseUrl()}/api/face-registration`;
}

export function getFaceRegistrationApiBaseUrl(): string {
  return getFaceRegistrationBaseUrl();
}

const SAMPLE_SUBMIT_TIMEOUT_MS = 180_000;

export async function createFaceRegistrationSession(displayName: string) {
  try {
    const response = await fetch(`${getFaceRegistrationBaseUrl()}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ display_name: displayName }),
    });

    const session = await readJsonResponse<FaceRegistrationSession>(response);
    if (!session.session_id?.trim()) {
      throw new Error(
        `Backend at ${getFaceRegistrationBaseUrl()} did not return a registration session id.`,
      );
    }

    return session;
  } catch (error) {
    throw toFaceRegistrationRequestError(error, "create registration session");
  }
}

export async function submitFaceRegistrationSample(
  sessionId: string,
  pose: PoseName,
  frame: string,
) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), SAMPLE_SUBMIT_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${getFaceRegistrationBaseUrl()}/sessions/${encodeURIComponent(sessionId)}/samples`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pose, frame }),
        signal: controller.signal,
      },
    );

    return await readJsonResponse<FaceRegistrationSampleResponse>(response);
  } catch (error) {
    throw toFaceRegistrationRequestError(error, "submit registration sample");
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function completeFaceRegistrationSession(sessionId: string) {
  try {
    const response = await fetch(
      `${getFaceRegistrationBaseUrl()}/sessions/${encodeURIComponent(sessionId)}/complete`,
      {
        method: "POST",
      },
    );

    return await readJsonResponse<FaceRegistrationCompleteResponse>(response);
  } catch (error) {
    throw toFaceRegistrationRequestError(error, "complete registration session");
  }
}

export async function cancelFaceRegistrationSession(sessionId: string) {
  try {
    const response = await fetch(
      `${getFaceRegistrationBaseUrl()}/sessions/${encodeURIComponent(sessionId)}`,
      {
        method: "DELETE",
      },
    );

    await readJsonResponse(response);
  } catch (error) {
    throw toFaceRegistrationRequestError(error, "cancel registration session");
  }
}

export function isRegistrationSessionMissingError(error: unknown): boolean {
  if (error instanceof FaceRegistrationApiError) {
    return error.status === 404;
  }

  return (
    error instanceof Error &&
    error.message.toLowerCase().includes("registration session not found")
  );
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new FaceRegistrationApiError(
      `Face registration request failed (${response.status}).`,
      response.status,
    );
  }

  if (!response.ok) {
    throw new FaceRegistrationApiError(extractDetail(payload), response.status);
  }

  return payload as T;
}

function extractDetail(payload: unknown): string {
  if (typeof payload === "object" && payload !== null && "detail" in payload) {
    const detail = (payload as { detail?: unknown }).detail;
    if (typeof detail === "string") {
      return detail;
    }
    if (Array.isArray(detail)) {
      return detail.map((entry) => String(entry)).join(", ");
    }
  }

  return "Face registration request failed.";
}

function toFaceRegistrationRequestError(error: unknown, action: string): Error {
  if (error instanceof FaceRegistrationApiError) {
    return error;
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return new Error(
      "Face analysis timed out after 3 minutes. The backend may still be loading InsightFace on Railway — try Capture again.",
    );
  }
  if (error instanceof TypeError) {
    if (action.includes("submit")) {
      return new Error(
        "Backend did not respond while analyzing the face sample. First capture on Railway can take 1–3 minutes — wait and try Capture again.",
      );
    }
    return new Error(
      `Cannot reach backend at ${getFaceRegistrationBaseUrl()} to ${action}. Check VITE_API_BASE_URL.`,
    );
  }
  if (error instanceof Error) {
    return error;
  }

  return new Error(`Unable to ${action}.`);
}
