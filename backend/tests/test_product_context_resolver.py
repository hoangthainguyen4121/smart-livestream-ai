import json
from pathlib import Path

import pytest

from app.services.product_context_resolver import resolve_product_context


FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture()
def catalog() -> list[dict]:
    return json.loads((FIXTURES_DIR / "sample_catalog.json").read_text(encoding="utf-8"))


def test_camera_product_beats_pinned_for_deictic_comment(catalog):
    resolution = resolve_product_context(
        comment="cái này bao nhiêu?",
        catalog=catalog,
        pinned_product_id="lipstick-ruby",
        selected_camera_product_id="glasses-a",
    )

    assert resolution.product is not None
    assert resolution.product["id"] == "glasses-a"
    assert resolution.source == "camera_context"
    assert resolution.confidence > 0.8


def test_pinned_product_used_for_deictic_without_camera(catalog):
    resolution = resolve_product_context(
        comment="món này còn hàng không?",
        catalog=catalog,
        pinned_product_id="lipstick-ruby",
        selected_camera_product_id=None,
    )

    assert resolution.product is not None
    assert resolution.product["id"] == "lipstick-ruby"
    assert resolution.source == "pinned_product"


def test_explicit_catalog_match_beats_pinned_product(catalog):
    resolution = resolve_product_context(
        comment="áo trắng bao nhiêu?",
        catalog=catalog,
        pinned_product_id="glasses-a",
        selected_camera_product_id=None,
    )

    assert resolution.product is not None
    assert resolution.product["id"] == "oversize-tee"
    assert resolution.source == "catalog_match"


def test_explicit_catalog_match_beats_camera_product(catalog):
    resolution = resolve_product_context(
        comment="áo thun trắng còn size M không?",
        catalog=catalog,
        pinned_product_id="glasses-a",
        selected_camera_product_id="glasses-a",
    )

    assert resolution.product is not None
    assert resolution.product["id"] == "oversize-tee"
    assert resolution.source == "catalog_match"


def test_clarification_without_context(catalog):
    resolution = resolve_product_context(
        comment="mua cái này",
        catalog=catalog,
        pinned_product_id=None,
        selected_camera_product_id=None,
    )

    assert resolution.product is None
    assert resolution.source == "clarification"
    assert resolution.is_clarification is True
    assert resolution.clarification_question is not None
    assert resolution.confidence < 0.5


def test_source_and_confidence_returned(catalog):
    resolution = resolve_product_context(
        comment="giá bao nhiêu?",
        catalog=catalog,
        pinned_product_id="glasses-a",
    )

    assert resolution.source == "pinned_product"
    assert resolution.confidence == pytest.approx(0.65)
    assert "pinned product" in resolution.explanation.lower()


def test_camera_vision_beats_pinned_for_generic_comment(catalog):
    resolution = resolve_product_context(
        comment="giá bao nhiêu?",
        catalog=catalog,
        pinned_product_id="lipstick-ruby",
        detected_camera_product_id="glasses-a",
        detected_camera_confidence=0.82,
    )

    assert resolution.product is not None
    assert resolution.product["id"] == "glasses-a"
    assert resolution.source == "camera_vision"


def test_explicit_catalog_beats_camera_vision(catalog):
    resolution = resolve_product_context(
        comment="son ruby giá bao nhiêu?",
        catalog=catalog,
        detected_camera_product_id="glasses-a",
        detected_camera_confidence=0.95,
    )

    assert resolution.product is not None
    assert resolution.product["id"] == "lipstick-ruby"
    assert resolution.source == "catalog_match"


def test_low_confidence_vision_falls_back_to_manual_camera(catalog):
    resolution = resolve_product_context(
        comment="cái này bao nhiêu?",
        catalog=catalog,
        selected_camera_product_id="glasses-a",
        detected_camera_product_id="oversize-tee",
        detected_camera_confidence=0.4,
    )

    assert resolution.product is not None
    assert resolution.product["id"] == "glasses-a"
    assert resolution.source == "camera_context"
