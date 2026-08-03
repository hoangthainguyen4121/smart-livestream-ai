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


client = TestClient(app)


def test_health_returns_ok() -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["chat_persistence_mode"] == "memory"
    assert payload["durable_chat_history"] is False
    assert payload["chat_retention_deletion_job"] == "not_implemented"
