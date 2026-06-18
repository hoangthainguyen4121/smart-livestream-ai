from pathlib import Path
import sys

from fastapi.testclient import TestClient


BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT.parent

for path in (BACKEND_ROOT, PROJECT_ROOT):
    path_text = str(path)
    if path_text not in sys.path:
        sys.path.insert(0, path_text)

from app.main import app  # noqa: E402
from app.api.video_feed import IdentityPresenceState, suppress_conflicting_gestures  # noqa: E402
from app.api.video_feed import update_face_interaction_events  # noqa: E402
from app.services.interaction_events import InteractionEventService  # noqa: E402
from app.services.interaction_events import interaction_event_service  # noqa: E402


client = TestClient(app)


def test_interaction_event_service_formats_raise_hand_label() -> None:
    service = InteractionEventService()

    event = service.append_gesture_event(
        username="hoang",
        gesture="Raise Hand",
        now=1.0,
    )

    assert event is not None
    assert event.label == "hoang raised hand"
    assert service.recent_events()[0]["type"] == "raise_hand"
    assert service.recent_events()[0]["gesture"] == "Raise Hand"


def test_interaction_event_service_applies_gesture_cooldown() -> None:
    service = InteractionEventService(cooldown_seconds=2.5)

    first = service.append_gesture_event(username="hoang", gesture="Wave", now=1.0)
    second = service.append_gesture_event(username="hoang", gesture="Wave", now=2.0)
    third = service.append_gesture_event(username="hoang", gesture="Wave", now=4.0)

    assert first is not None
    assert second is None
    assert third is not None
    assert len(service.recent_events()) == 2


def test_interaction_event_service_formats_identity_and_face_events() -> None:
    service = InteractionEventService()

    appeared = service.append_event(
        event_type="identity_appeared",
        username="hoang",
        now=1.0,
    )
    unknown = service.append_event(
        event_type="unknown_face_detected",
        now=1.0,
    )
    multiple = service.append_event(
        event_type="multiple_faces_detected",
        now=1.0,
    )

    assert appeared is not None
    assert appeared.label == "hoang appeared on stream"
    assert unknown is not None
    assert unknown.label == "Unknown face detected"
    assert multiple is not None
    assert multiple.label == "Multiple faces detected"


def test_interaction_event_service_formats_thumbs_up_label() -> None:
    service = InteractionEventService()

    event = service.append_gesture_event(
        username="hoang",
        gesture="Thumbs Up",
        now=1.0,
    )

    assert event is not None
    assert event.type == "thumbs_up"
    assert event.label == "hoang gave thumbs up"


def test_recent_interaction_events_endpoint_returns_events() -> None:
    interaction_event_service.clear()
    interaction_event_service.append_gesture_event(
        username="hoang",
        gesture="Wave",
        now=1.0,
    )

    response = client.get("/api/interaction-events/recent")

    assert response.status_code == 200
    assert response.json()["events"][0]["label"] == "hoang waved"
    interaction_event_service.clear()


def test_video_feed_identity_presence_emits_appeared_and_disappeared(monkeypatch) -> None:
    current_time = 10.0
    monkeypatch.setattr("app.api.video_feed.time.perf_counter", lambda: current_time)
    interaction_event_service.clear()
    presence = IdentityPresenceState()

    update_face_interaction_events([RecognitionResultStub("hoang", True)], presence)
    current_time = 10.1
    monkeypatch.setattr("app.api.video_feed.time.perf_counter", lambda: current_time)
    update_face_interaction_events([], presence)
    current_time = 11.2
    monkeypatch.setattr("app.api.video_feed.time.perf_counter", lambda: current_time)
    update_face_interaction_events([], presence)

    labels = [event["label"] for event in interaction_event_service.recent_events()]
    assert labels == ["hoang appeared on stream", "hoang left the frame"]
    interaction_event_service.clear()


def test_video_feed_suppresses_thumbs_up_when_raise_hand_is_present() -> None:
    events = [
        GestureEventStub("Raise Hand"),
        GestureEventStub("Thumbs Up"),
    ]

    visible_events = suppress_conflicting_gestures(events)

    assert [event.name for event in visible_events] == ["Raise Hand"]


class RecognitionResultStub:
    def __init__(self, label: str, is_known: bool) -> None:
        self.label = label
        self.is_known = is_known


class GestureEventStub:
    def __init__(self, name: str) -> None:
        self.name = name
