import base64
import binascii

import cv2
import numpy as np


DATA_URL_SEPARATOR = ","


def decode_data_url_frame(frame_payload: str) -> np.ndarray:
    if not isinstance(frame_payload, str) or not frame_payload.strip():
        raise ValueError("Frame payload must be a non-empty string")

    payload = frame_payload.strip()
    if payload.startswith("data:"):
        if DATA_URL_SEPARATOR not in payload:
            raise ValueError("Invalid data URL frame payload")

        metadata, payload = payload.split(DATA_URL_SEPARATOR, 1)
        if "base64" not in metadata:
            raise ValueError("Data URL frame payload must be base64 encoded")

    try:
        image_bytes = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as error:
        raise ValueError("Invalid base64 frame payload") from error

    if not image_bytes:
        raise ValueError("Decoded frame payload is empty")

    image_buffer = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(image_buffer, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Frame payload is not a valid image")

    return image
