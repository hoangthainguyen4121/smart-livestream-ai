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

function getFaceRegistrationBaseUrl(): string {
  return `${getApiBaseUrl()}/api/face-registration`;
}

export async function createFaceRegistrationSession(displayName: string) {
  const response = await fetch(`${getFaceRegistrationBaseUrl()}/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ display_name: displayName }),
  });

  return readJsonResponse<FaceRegistrationSession>(response);
}

export async function submitFaceRegistrationSample(
  sessionId: string,
  pose: PoseName,
  frame: string,
) {
  const response = await fetch(`${getFaceRegistrationBaseUrl()}/sessions/${sessionId}/samples`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ pose, frame }),
  });

  return readJsonResponse<FaceRegistrationSampleResponse>(response);
}

export async function completeFaceRegistrationSession(sessionId: string) {
  const response = await fetch(`${getFaceRegistrationBaseUrl()}/sessions/${sessionId}/complete`, {
    method: "POST",
  });

  return readJsonResponse<FaceRegistrationCompleteResponse>(response);
}

export async function cancelFaceRegistrationSession(sessionId: string) {
  const response = await fetch(`${getFaceRegistrationBaseUrl()}/sessions/${sessionId}`, {
    method: "DELETE",
  });

  await readJsonResponse(response);
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.detail ?? "Face registration request failed.");
  }

  return payload as T;
}
