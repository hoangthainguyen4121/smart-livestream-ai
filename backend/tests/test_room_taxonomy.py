from __future__ import annotations

import json
from pathlib import Path
import sys

import pytest
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT.parent

for path in (BACKEND_ROOT, PROJECT_ROOT):
    path_text = str(path)
    if path_text not in sys.path:
        sys.path.insert(0, path_text)

from app.main import app  # noqa: E402
from app.services.live_room_types import (  # noqa: E402
    get_allowed_room_types,
    load_room_taxonomy,
    resolve_room_type_label,
    room_type_requires_commerce,
    validate_room_type,
)
from app.services.memory_live_sessions import get_memory_live_session_store  # noqa: E402

SHARED_TAXONOMY = PROJECT_ROOT / "shared" / "live_room_taxonomy.json"


@pytest.fixture()
def client(memory_mode_env: None) -> TestClient:
    get_memory_live_session_store().clear()
    return TestClient(app)


def test_backend_ids_match_shared_taxonomy() -> None:
    shared = json.loads(SHARED_TAXONOMY.read_text(encoding="utf-8"))
    assert set(get_allowed_room_types()) == {item["id"] for item in shared["categories"]}
    assert load_room_taxonomy()["default_id"] == shared["default_id"]


def test_legacy_ids_remain_valid() -> None:
    for room_type in ("fashion", "beauty", "food", "electronics", "general"):
        assert validate_room_type(room_type) == room_type


def test_commerce_requirement_comes_from_shared_taxonomy() -> None:
    assert room_type_requires_commerce("fashion") is True
    assert room_type_requires_commerce("chat") is False
    assert room_type_requires_commerce("karaoke") is False
    assert room_type_requires_commerce("general") is False


def test_new_social_category_creates_room_without_commerce(client: TestClient) -> None:
    response = client.post(
        "/api/live-sessions",
        json={"name": "Karaoke Live", "room_type": "karaoke"},
    )
    assert response.status_code == 201
    assert response.json()["room_type"] == "karaoke"


def test_invalid_category_rejected(client: TestClient) -> None:
    response = client.post(
        "/api/live-sessions",
        json={"name": "Bad Cat", "room_type": "spaceship"},
    )
    assert response.status_code == 422


def test_unknown_label_fallback() -> None:
    assert resolve_room_type_label("not_a_real_category", locale="vi") == "Tổng hợp"
    assert resolve_room_type_label("not_a_real_category", locale="en") == "General"
