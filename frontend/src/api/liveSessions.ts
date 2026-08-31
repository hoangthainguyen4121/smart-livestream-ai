import { getApiBaseUrl } from "./config";
import { authHeaders } from "./auth";

export type LiveSessionStatus = "active" | "ended";

export type LiveSession = {
  id: string;
  room_id: string;
  status: LiveSessionStatus;
  started_at: string;
  ended_at: string | null;
  ended_reason: string | null;
  metadata: Record<string, unknown>;
  already_ended?: boolean;
  name?: string | null;
  room_type?: string | null;
  host_present?: boolean;
  host_recoverable?: boolean;
  host_lease_expires_at?: string | null;
  media_live?: boolean;
  is_host?: boolean;
  grace_remaining_seconds?: number | null;
  seller_user_id?: string | null;
  shop_id?: string | null;
};

export type LiveRoom = {
  id: string;
  room_id: string;
  name: string;
  room_type: string;
  status: LiveSessionStatus;
  started_at: string;
  ended_at: string | null;
  metadata: Record<string, unknown>;
  host_present?: boolean;
  host_recoverable?: boolean;
  host_lease_expires_at?: string | null;
  media_live?: boolean;
  host_resume_token?: string;
  seller_user_id?: string | null;
  shop_id?: string | null;
};

export type HostHeartbeatPayload = {
  host_token: string;
  media_live?: boolean;
};

export type CreateLiveRoomPayload = {
  name: string;
  room_type: string;
  product_ids?: string[];
};

export type ModerationViolationPayload = {
  code: "sharp_object_detected";
  label: "knife" | "scissors";
  confidence: number;
  evidence_count: number;
  window_ms: number;
  detected_at: string;
};

export async function listActiveLiveRooms(): Promise<LiveRoom[]> {
  const response = await fetch(`${getApiBaseUrl()}/api/live-sessions?status=active`);
  if (!response.ok) {
    throw new Error(`Failed to load live rooms (${response.status}).`);
  }
  return (await response.json()) as LiveRoom[];
}

export async function createLiveRoom(payload: CreateLiveRoomPayload): Promise<LiveRoom> {
  const response = await fetch(`${getApiBaseUrl()}/api/live-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    let detail = `Failed to create live room (${response.status}).`;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") {
        detail = body.detail;
      } else if (
        body.detail &&
        typeof body.detail === "object" &&
        "message" in body.detail &&
        typeof (body.detail as { message: unknown }).message === "string"
      ) {
        detail = (body.detail as { message: string }).message;
      }
    } catch {
      // keep default
    }
    throw new Error(detail);
  }
  return (await response.json()) as LiveRoom;
}

export async function sendHostHeartbeat(
  sessionId: string,
  payload: HostHeartbeatPayload,
): Promise<LiveSession> {
  const response = await fetch(
    `${getApiBaseUrl()}/api/live-sessions/${encodeURIComponent(sessionId)}/host-heartbeat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) {
    throw new Error(`Host heartbeat failed (${response.status}).`);
  }
  return (await response.json()) as LiveSession;
}

export async function reclaimHost(roomId: string, hostToken: string): Promise<LiveSession> {
  const response = await fetch(
    `${getApiBaseUrl()}/api/live-sessions/by-room/${encodeURIComponent(roomId)}/reclaim-host`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ host_token: hostToken }),
    },
  );
  if (!response.ok) {
    throw new Error(`Failed to reclaim host (${response.status}).`);
  }
  return (await response.json()) as LiveSession;
}

export async function startLiveSession(roomId: string): Promise<LiveSession> {
  const response = await fetch(`${getApiBaseUrl()}/api/live-sessions/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ room_id: roomId }),
  });
  if (!response.ok) {
    throw new Error(`Failed to start live session (${response.status}).`);
  }
  return (await response.json()) as LiveSession;
}

export async function endLiveSession(
  sessionId: string,
  hostToken?: string | null,
): Promise<LiveSession> {
  const response = await fetch(
    `${getApiBaseUrl()}/api/live-sessions/${encodeURIComponent(sessionId)}/end`,
    {
      method: "POST",
      headers: {
        ...authHeaders(),
        ...(hostToken ? { "X-Host-Token": hostToken } : {}),
      },
    },
  );
  if (!response.ok) {
    throw new Error(`Failed to end live session (${response.status}).`);
  }
  return (await response.json()) as LiveSession;
}

export async function reportModerationViolation(
  sessionId: string,
  payload: ModerationViolationPayload,
  hostToken?: string | null,
): Promise<LiveSession> {
  const response = await fetch(
    `${getApiBaseUrl()}/api/live-sessions/${encodeURIComponent(sessionId)}/moderation-violations`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
        ...(hostToken ? { "X-Host-Token": hostToken } : {}),
      },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) {
    throw new Error(`Failed to report moderation violation (${response.status}).`);
  }
  return (await response.json()) as LiveSession;
}

export async function getCurrentLiveSession(roomId: string): Promise<LiveSession | null> {
  const response = await fetch(
    `${getApiBaseUrl()}/api/live-sessions/by-room/${encodeURIComponent(roomId)}/current`,
  );
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Failed to load current live session (${response.status}).`);
  }
  return (await response.json()) as LiveSession;
}
