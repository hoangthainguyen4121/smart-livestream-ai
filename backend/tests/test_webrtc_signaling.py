from __future__ import annotations

from pathlib import Path
import sys
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT.parent

for path in (BACKEND_ROOT, PROJECT_ROOT):
    path_text = str(path)
    if path_text not in sys.path:
        sys.path.insert(0, path_text)

from app.main import app  # noqa: E402
from app.services.webrtc_signaling import (  # noqa: E402
    WebRtcSignalingError,
    validate_webrtc_payload,
)


client = TestClient(app)


def unique_room() -> str:
    return f"rtc-{uuid4()}"


def test_validate_rejects_room_mismatch() -> None:
    with pytest.raises(WebRtcSignalingError):
        validate_webrtc_payload(
            {
                "type": "webrtc_join",
                "peer_id": "p1",
                "role": "viewer",
                "room_id": "other",
            },
            room_id="room-a",
        )


def test_validate_requires_target_for_offer() -> None:
    with pytest.raises(WebRtcSignalingError):
        validate_webrtc_payload(
            {
                "type": "webrtc_offer",
                "peer_id": "host",
                "sdp": {"type": "offer", "sdp": "v=0"},
            },
            room_id="room-a",
        )


def test_webrtc_join_broadcast_same_room_only() -> None:
    room_a = unique_room()
    room_b = unique_room()

    with client.websocket_connect(f"/ws/chat/{room_a}") as host:
        with client.websocket_connect(f"/ws/chat/{room_a}") as viewer:
            with client.websocket_connect(f"/ws/chat/{room_b}") as outsider:
                host.receive_json()
                viewer.receive_json()
                outsider.receive_json()

                host.send_json(
                    {
                        "type": "webrtc_join",
                        "peer_id": "host-1",
                        "role": "host",
                    }
                )
                joined = viewer.receive_json()
                assert joined["type"] == "webrtc_join"
                assert joined["peer_id"] == "host-1"
                assert joined["room_id"] == room_a

                outsider.send_json(
                    {
                        "type": "chat_message",
                        "author": "x",
                        "text": "ping",
                    }
                )
                # outsider still only receives chat in room_b, not webrtc from room_a
                outsider_msg = outsider.receive_json()
                assert outsider_msg["type"] == "chat_message"


def test_webrtc_offer_routes_to_target_peer() -> None:
    room = unique_room()
    with client.websocket_connect(f"/ws/chat/{room}") as host:
        with client.websocket_connect(f"/ws/chat/{room}") as viewer:
            host.receive_json()
            viewer.receive_json()

            host.send_json({"type": "webrtc_join", "peer_id": "host-1", "role": "host"})
            viewer.receive_json()  # host join
            viewer.send_json({"type": "webrtc_join", "peer_id": "viewer-1", "role": "viewer"})
            host.receive_json()  # viewer join

            host.send_json(
                {
                    "type": "webrtc_offer",
                    "peer_id": "host-1",
                    "target_peer_id": "viewer-1",
                    "sdp": {"type": "offer", "sdp": "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n"},
                }
            )
            offer = viewer.receive_json()
            assert offer["type"] == "webrtc_offer"
            assert offer["target_peer_id"] == "viewer-1"
            assert offer["peer_id"] == "host-1"


def test_malformed_webrtc_rejected() -> None:
    room = unique_room()
    with client.websocket_connect(f"/ws/chat/{room}") as ws:
        ws.receive_json()
        ws.send_json({"type": "webrtc_offer", "peer_id": "p"})
        error = ws.receive_json()
        assert error["type"] == "error"
        assert error["code"] == "webrtc_signaling_invalid"


def test_disconnect_broadcasts_leave() -> None:
    room = unique_room()
    with client.websocket_connect(f"/ws/chat/{room}") as host:
        host.receive_json()
        with client.websocket_connect(f"/ws/chat/{room}") as viewer:
            viewer.receive_json()
            viewer.send_json({"type": "webrtc_join", "peer_id": "viewer-1", "role": "viewer"})
            host.receive_json()
        leave = host.receive_json()
        assert leave["type"] == "webrtc_leave"
        assert leave["peer_id"] == "viewer-1"


def test_multiple_viewers_receive_targeted_offers_separately() -> None:
    room = unique_room()
    with client.websocket_connect(f"/ws/chat/{room}") as host:
        with client.websocket_connect(f"/ws/chat/{room}") as viewer_a:
            with client.websocket_connect(f"/ws/chat/{room}") as viewer_b:
                host.receive_json()
                viewer_a.receive_json()
                viewer_b.receive_json()

                host.send_json({"type": "webrtc_join", "peer_id": "host-1", "role": "host"})
                viewer_a.receive_json()
                viewer_b.receive_json()
                viewer_a.send_json({"type": "webrtc_join", "peer_id": "viewer-a", "role": "viewer"})
                host.receive_json()
                viewer_b.receive_json()
                viewer_b.send_json({"type": "webrtc_join", "peer_id": "viewer-b", "role": "viewer"})
                host.receive_json()
                viewer_a.receive_json()

                host.send_json(
                    {
                        "type": "webrtc_offer",
                        "peer_id": "host-1",
                        "target_peer_id": "viewer-a",
                        "sdp": {"type": "offer", "sdp": "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n"},
                    }
                )
                offer_a = viewer_a.receive_json()
                assert offer_a["type"] == "webrtc_offer"
                assert offer_a["target_peer_id"] == "viewer-a"

                host.send_json(
                    {
                        "type": "webrtc_offer",
                        "peer_id": "host-1",
                        "target_peer_id": "viewer-b",
                        "sdp": {"type": "offer", "sdp": "v=0\r\no=- 2 2 IN IP4 127.0.0.1\r\n"},
                    }
                )
                offer_b = viewer_b.receive_json()
                assert offer_b["type"] == "webrtc_offer"
                assert offer_b["target_peer_id"] == "viewer-b"
