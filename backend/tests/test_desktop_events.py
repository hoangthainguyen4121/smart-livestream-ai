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
from app.services.interaction_events import interaction_event_service  # noqa: E402


client = TestClient(app)


def test_desktop_events_endpoint_stores_raise_hand_event() -> None:
    interaction_event_service.clear()

    response = client.post(
        "/api/desktop/events",
        json={
            "client_id": "test-desktop",
            "events": [
                {
                    "type": "raise_hand",
                    "username": "hoang",
                    "gesture": "Raise Hand",
                }
            ],
        },
    )

    assert response.status_code == 200
    assert response.json() == {"accepted": 1, "stored": 1}

    recent = client.get("/api/interaction-events/recent")
    assert recent.status_code == 200
    assert recent.json()["events"][0]["label"] == "hoang raised hand"
    interaction_event_service.clear()


def test_desktop_events_endpoint_stores_identity_appeared_event() -> None:
    interaction_event_service.clear()

    response = client.post(
        "/api/desktop/events",
        json={
            "client_id": "test-desktop",
            "events": [
                {
                    "type": "identity_appeared",
                    "username": "hoang",
                }
            ],
        },
    )

    assert response.status_code == 200
    assert response.json()["stored"] == 1

    recent = client.get("/api/interaction-events/recent")
    assert recent.json()["events"][0]["label"] == "hoang appeared on stream"
    interaction_event_service.clear()


def test_desktop_events_endpoint_rejects_wave_gesture() -> None:
    interaction_event_service.clear()

    response = client.post(
        "/api/desktop/events",
        json={
            "client_id": "test-desktop",
            "events": [
                {
                    "type": "wave",
                    "username": "hoang",
                    "gesture": "Wave",
                }
            ],
        },
    )

    assert response.status_code == 200
    assert response.json() == {"accepted": 1, "stored": 0}
    assert client.get("/api/interaction-events/recent").json()["events"] == []
    interaction_event_service.clear()


def test_desktop_events_endpoint_requires_payload() -> None:
    response = client.post("/api/desktop/events", json={"client_id": "test-desktop", "events": []})
    assert response.status_code == 400
