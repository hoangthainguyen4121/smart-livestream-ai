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
