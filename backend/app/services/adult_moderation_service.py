"""Combine suggestive classifier + Falconsai → SAFE | SUGGESTIVE | EXPLICIT."""

from __future__ import annotations

import logging
import os
from typing import Any, Optional

from app.services.adult_moderation_policy import (
    AdultFrameDecision,
    AdultFrameSignals,
    decide_adult_frame,
)
from app.services.nsfw_frame_gate_service import (
    is_nsfw_frame_gate_enabled,
    nsfw_frame_gate_service,
)
from app.services.suggestive_classifier_service import (
    is_suggestive_classifier_enabled,
    suggestive_classifier_service,
)

logger = logging.getLogger(__name__)


def is_adult_moderation_enabled() -> bool:
    """Adult path is on when either classifier lane is enabled."""
    return is_suggestive_classifier_enabled() or is_nsfw_frame_gate_enabled()


def suggestive_min_score() -> float:
    raw = os.getenv("SUGGESTIVE_MIN_SCORE", "0.35").strip()
    try:
        return max(0.0, min(1.0, float(raw)))
    except ValueError:
        return 0.35


def falconsai_min_nsfw() -> float:
    raw = os.getenv("NSFW_MIN_SCORE", "0.70").strip()
    try:
        return max(0.0, min(1.0, float(raw)))
    except ValueError:
        return 0.70


class AdultModerationService:
    def status(self) -> dict[str, Any]:
        suggestive = suggestive_classifier_service.status()
        falconsai = nsfw_frame_gate_service.status()
        enabled = is_adult_moderation_enabled()
        # When both lanes are enabled, require both loaded; else require the enabled lane.
        if is_suggestive_classifier_enabled() and is_nsfw_frame_gate_enabled():
            ready = bool(suggestive.get("ready")) and bool(falconsai.get("ready"))
        elif is_suggestive_classifier_enabled():
            ready = bool(suggestive.get("ready"))
        elif is_nsfw_frame_gate_enabled():
            ready = bool(falconsai.get("ready"))
        else:
            ready = False

        return {
            "enabled": enabled,
            "ready": ready,
            "taxonomy": ["SAFE", "SUGGESTIVE", "EXPLICIT"],
            "auto_terminates_session": False,
            "stores_violation_images": False,
            "suggestive": suggestive,
            "falconsai": falconsai,
            "suggestive_min_score": suggestive_min_score(),
            "falconsai_min_nsfw": falconsai_min_nsfw(),
        }

    def classify_image_base64(self, image_base64: str) -> dict[str, Any]:
        if not is_adult_moderation_enabled():
            raise RuntimeError("adult_moderation_disabled")

        suggestive_label: Optional[str] = None
        suggestive_score: Optional[float] = None
        suggestive_scores: Optional[dict[str, float]] = None
        suggestive_inference_ms: Optional[float] = None
        suggestive_error: Optional[str] = None

        falconsai_label: Optional[str] = None
        falconsai_nsfw: Optional[float] = None
        falconsai_normal: Optional[float] = None
        falconsai_is_nsfw = False
        falconsai_inference_ms: Optional[float] = None
        falconsai_error: Optional[str] = None

        if is_suggestive_classifier_enabled():
            try:
                result = suggestive_classifier_service.classify_image_base64(image_base64)
                suggestive_label = result.label
                suggestive_score = result.score
                suggestive_scores = result.scores
                suggestive_inference_ms = result.inference_ms
            except Exception as exc:  # noqa: BLE001
                suggestive_error = f"{type(exc).__name__}: {exc}"
                logger.warning("Suggestive classify failed: %s", suggestive_error)

        if is_nsfw_frame_gate_enabled():
            try:
                result = nsfw_frame_gate_service.classify_image_base64(image_base64)
                falconsai_label = result.label
                falconsai_nsfw = result.nsfw_score
                falconsai_normal = result.normal_score
                falconsai_is_nsfw = result.is_nsfw
                falconsai_inference_ms = result.inference_ms
            except Exception as exc:  # noqa: BLE001
                falconsai_error = f"{type(exc).__name__}: {exc}"
                logger.warning("Falconsai classify failed: %s", falconsai_error)

        if (
            suggestive_label is None
            and falconsai_label is None
            and (suggestive_error or falconsai_error)
        ):
            raise RuntimeError(
                "adult_classify_failed: "
                + "; ".join(
                    part
                    for part in (suggestive_error, falconsai_error)
                    if part
                )
            )

        decision: AdultFrameDecision = decide_adult_frame(
            AdultFrameSignals(
                suggestive_label=suggestive_label,
                suggestive_score=suggestive_score,
                suggestive_scores=suggestive_scores,
                falconsai_label=falconsai_label,
                falconsai_nsfw_score=falconsai_nsfw,
                falconsai_normal_score=falconsai_normal,
                falconsai_is_nsfw=falconsai_is_nsfw,
            ),
            suggestive_min_score=suggestive_min_score(),
            falconsai_min_nsfw=falconsai_min_nsfw(),
        )

        return {
            "state": decision.state,
            "primary_signal": decision.primary_signal,
            "reason": decision.reason,
            "suggestive_mapped": decision.suggestive_mapped,
            "falconsai_mapped": decision.falconsai_mapped,
            "suggestive": {
                "label": suggestive_label,
                "score": suggestive_score,
                "scores": suggestive_scores,
                "inference_ms": suggestive_inference_ms,
                "error": suggestive_error,
                "enabled": is_suggestive_classifier_enabled(),
            },
            "falconsai": {
                "label": falconsai_label,
                "nsfw_score": falconsai_nsfw,
                "normal_score": falconsai_normal,
                "is_nsfw": falconsai_is_nsfw,
                "inference_ms": falconsai_inference_ms,
                "error": falconsai_error,
                "enabled": is_nsfw_frame_gate_enabled(),
            },
            "auto_terminates_session": False,
            "stores_violation_images": False,
        }


adult_moderation_service = AdultModerationService()
