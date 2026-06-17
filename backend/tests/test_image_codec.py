from pathlib import Path
import base64
import sys

import cv2
import numpy as np
import pytest


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.utils.image_codec import decode_data_url_frame  # noqa: E402


def test_decode_data_url_frame_returns_bgr_image() -> None:
    frame_payload = create_tiny_jpeg_data_url()

    image = decode_data_url_frame(frame_payload)

    assert image.shape == (2, 2, 3)
    assert image.dtype == np.uint8


def test_decode_plain_base64_frame_returns_bgr_image() -> None:
    frame_payload = create_tiny_jpeg_data_url().split(",", 1)[1]

    image = decode_data_url_frame(frame_payload)

    assert image.shape == (2, 2, 3)


def test_decode_data_url_frame_rejects_invalid_payload() -> None:
    with pytest.raises(ValueError, match="Invalid base64 frame payload"):
        decode_data_url_frame("not-a-valid-frame")


def create_tiny_jpeg_data_url() -> str:
    image = np.zeros((2, 2, 3), dtype=np.uint8)
    ok, encoded = cv2.imencode(".jpg", image)
    assert ok

    payload = base64.b64encode(encoded.tobytes()).decode("ascii")
    return f"data:image/jpeg;base64,{payload}"
