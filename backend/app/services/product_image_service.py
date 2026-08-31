from __future__ import annotations

from io import BytesIO
import os
from pathlib import Path
from uuid import uuid4

from PIL import Image, UnidentifiedImageError


MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024
MAX_PRODUCT_IMAGE_DIMENSION = 1600
ALLOWED_PRODUCT_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}


class ProductImageError(ValueError):
    pass


def product_image_directory() -> Path:
    configured = os.getenv("PRODUCT_IMAGE_DIR", "").strip()
    if configured:
        return Path(configured).resolve()
    return Path(__file__).resolve().parents[2] / "data" / "product-images"


def save_product_image(content: bytes, content_type: str | None) -> str:
    if content_type not in ALLOWED_PRODUCT_IMAGE_TYPES:
        raise ProductImageError("Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP.")
    if not content:
        raise ProductImageError("Tệp ảnh đang trống.")
    if len(content) > MAX_PRODUCT_IMAGE_BYTES:
        raise ProductImageError("Ảnh không được lớn hơn 5 MB.")

    try:
        with Image.open(BytesIO(content)) as source:
            source.verify()
        with Image.open(BytesIO(content)) as source:
            image = source.convert("RGB")
            image.thumbnail(
                (MAX_PRODUCT_IMAGE_DIMENSION, MAX_PRODUCT_IMAGE_DIMENSION),
                Image.Resampling.LANCZOS,
            )
            directory = product_image_directory()
            directory.mkdir(parents=True, exist_ok=True)
            filename = f"{uuid4().hex}.webp"
            image.save(directory / filename, format="WEBP", quality=86, method=4)
    except (UnidentifiedImageError, OSError, ValueError) as error:
        raise ProductImageError("Tệp đã chọn không phải ảnh hợp lệ.") from error

    return f"/media/product-images/{filename}"
