from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from fastapi import WebSocket


WEBRTC_MESSAGE_TYPES = frozenset(
    {
        "webrtc_join",
        "webrtc_leave",
        "webrtc_offer",
        "webrtc_answer",
        "webrtc_ice_candidate",
        "host_media_started",
        "host_media_stopped",
    }
)

TARGETED_TYPES = frozenset(
    {
        "webrtc_offer",
        "webrtc_answer",
        "webrtc_ice_candidate",
    }
)

MAX_PEER_ID_LENGTH = 128
MAX_SDP_LENGTH = 100_000
MAX_CANDIDATE_LENGTH = 8_000


class WebRtcSignalingError(Exception):
    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


@dataclass
class RoomPeer:
    peer_id: str
    role: str
    websocket: WebSocket


class WebRtcPeerRegistry:
    def __init__(self) -> None:
        self._peers: dict[str, dict[str, RoomPeer]] = {}

    def register(self, room_id: str, peer: RoomPeer) -> None:
        room = self._peers.setdefault(room_id, {})
        room[peer.peer_id] = peer

    def unregister(self, room_id: str, peer_id: str) -> Optional[RoomPeer]:
        room = self._peers.get(room_id)
        if not room:
            return None
        removed = room.pop(peer_id, None)
        if not room:
            self._peers.pop(room_id, None)
        return removed

    def unregister_socket(self, room_id: str, websocket: WebSocket) -> list[RoomPeer]:
        room = self._peers.get(room_id)
        if not room:
            return []
        removed = [peer for peer in list(room.values()) if peer.websocket is websocket]
        for peer in removed:
            room.pop(peer.peer_id, None)
        if not room:
            self._peers.pop(room_id, None)
        return removed

    def get_peer(self, room_id: str, peer_id: str) -> Optional[RoomPeer]:
        return self._peers.get(room_id, {}).get(peer_id)

    def list_peers(self, room_id: str) -> list[RoomPeer]:
        return list(self._peers.get(room_id, {}).values())


def validate_webrtc_payload(payload: dict[str, Any], *, room_id: str) -> dict[str, Any]:
    message_type = payload.get("type")
    if message_type not in WEBRTC_MESSAGE_TYPES:
        raise WebRtcSignalingError("Unsupported WebRTC signaling type.")

    peer_id = payload.get("peer_id")
    if not isinstance(peer_id, str) or not peer_id.strip() or len(peer_id) > MAX_PEER_ID_LENGTH:
        raise WebRtcSignalingError("peer_id is required.")

    role = payload.get("role")
    if message_type in {"webrtc_join"}:
        if role not in {"host", "viewer"}:
            raise WebRtcSignalingError("role must be 'host' or 'viewer'.")

    payload_room = payload.get("room_id")
    if payload_room is not None and payload_room != room_id:
        raise WebRtcSignalingError("room_id mismatch.")

    target_peer_id = payload.get("target_peer_id")
    if message_type in TARGETED_TYPES:
        if (
            not isinstance(target_peer_id, str)
            or not target_peer_id.strip()
            or len(target_peer_id) > MAX_PEER_ID_LENGTH
        ):
            raise WebRtcSignalingError("target_peer_id is required for targeted signaling.")
        if target_peer_id == peer_id:
            raise WebRtcSignalingError("target_peer_id must differ from peer_id.")

    if message_type in {"webrtc_offer", "webrtc_answer"}:
        sdp = payload.get("sdp")
        if not isinstance(sdp, dict):
            raise WebRtcSignalingError("sdp must be an object.")
        sdp_type = sdp.get("type")
        sdp_text = sdp.get("sdp")
        if sdp_type not in {"offer", "answer", "pranswer", "rollback"}:
            raise WebRtcSignalingError("sdp.type is invalid.")
        if not isinstance(sdp_text, str) or not sdp_text.strip() or len(sdp_text) > MAX_SDP_LENGTH:
            raise WebRtcSignalingError("sdp.sdp is invalid.")

    if message_type == "webrtc_ice_candidate":
        candidate = payload.get("candidate")
        if candidate is not None and not isinstance(candidate, dict):
            raise WebRtcSignalingError("candidate must be an object or null.")
        if isinstance(candidate, dict):
            cand = candidate.get("candidate")
            if cand is not None and (
                not isinstance(cand, str) or len(cand) > MAX_CANDIDATE_LENGTH
            ):
                raise WebRtcSignalingError("candidate.candidate is invalid.")

    normalized: dict[str, Any] = {
        "type": message_type,
        "room_id": room_id,
        "peer_id": peer_id.strip(),
    }
    if isinstance(role, str):
        normalized["role"] = role
    if isinstance(target_peer_id, str) and target_peer_id.strip():
        normalized["target_peer_id"] = target_peer_id.strip()
    if "sdp" in payload:
        normalized["sdp"] = payload["sdp"]
    if "candidate" in payload:
        normalized["candidate"] = payload["candidate"]
    return normalized
