from __future__ import annotations

from io import BytesIO

import pytest
from PIL import Image

from app.services.product_image_service import ProductImageError, save_product_image


def image_bytes(format_name: str = "PNG") -> bytes:
    output = BytesIO()
    Image.new("RGB", (32, 24), (60, 90, 210)).save(output, format=format_name)
    return output.getvalue()


def test_save_product_image_normalizes_and_returns_media_url(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("PRODUCT_IMAGE_DIR", str(tmp_path))

    image_url = save_product_image(image_bytes(), "image/png")

    assert image_url.startswith("/media/product-images/")
    saved = tmp_path / image_url.rsplit("/", 1)[-1]
    assert saved.is_file()
    with Image.open(saved) as image:
        assert image.format == "WEBP"
        assert image.size == (32, 24)


@pytest.mark.parametrize(
    ("content", "content_type"),
    [(b"not-an-image", "image/png"), (image_bytes(), "image/gif")],
)
def test_save_product_image_rejects_invalid_uploads(
    tmp_path, monkeypatch: pytest.MonkeyPatch, content: bytes, content_type: str
) -> None:
    monkeypatch.setenv("PRODUCT_IMAGE_DIR", str(tmp_path))

    with pytest.raises(ProductImageError):
        save_product_image(content, content_type)
