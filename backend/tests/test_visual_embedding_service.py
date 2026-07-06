import base64
import io

import numpy as np
from PIL import Image

from app.services.visual_embedding_service import VisualEmbeddingService


def _solid_png_base64(red: int, green: int, blue: int) -> str:
    image = Image.new("RGB", (96, 96), (red, green, blue))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def test_sync_catalog_and_match_same_color(monkeypatch):
    monkeypatch.setenv("VISUAL_EMBEDDING_FORCE_FINGERPRINT", "true")
    service = VisualEmbeddingService()

    red = _solid_png_base64(220, 20, 20)
    blue = _solid_png_base64(20, 20, 220)

    sync_result = service.sync_catalog(
        [
            {"id": "lipstick-ruby", "name": "Son Ruby", "imageBase64": red},
            {"id": "glasses-a", "name": "Kính A", "imageBase64": blue},
        ]
    )
    assert sync_result["indexed"] == 2
    assert sync_result["embedder"] == "fingerprint"

    match = service.match_crop(red)
    assert match is not None
    assert match.product_id == "lipstick-ruby"
    assert match.score >= 0.55


def test_match_returns_none_when_catalog_empty():
    service = VisualEmbeddingService()
    assert service.match_crop(_solid_png_base64(10, 10, 10)) is None


def test_fingerprint_embedding_is_normalized():
    service = VisualEmbeddingService()
    image = np.full((64, 64, 3), 128, dtype=np.uint8)
    vector = service.embed_image_rgb(image)
    norm = float(np.linalg.norm(vector))
    assert abs(norm - 1.0) < 1e-5
