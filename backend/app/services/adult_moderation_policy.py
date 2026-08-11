"""Map suggestive + Falconsai signals → SAFE | SUGGESTIVE | EXPLICIT (no auto-terminate).

Score-based calibration (local eval 2026-08-09, .local/cv-eval/results.json):
- Do NOT trust top-1 porn→EXPLICIT (Breathless music-video FP).
- EXPLICIT needs strong porn/hentai + Falconsai confirmation.
- Mid porn / sexy mass without Falconsai → SUGGESTIVE.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional

AdultState = Literal["SAFE", "SUGGESTIVE", "EXPLICIT"]

# Calibrated defaults from scripts/evaluate_cv_accuracy.py grid search + manual fixups.
DEFAULT_SEXY_THR = 0.25
DEFAULT_PORN_SUGGESTIVE_LO = 0.55
DEFAULT_PORN_EXPLICIT = 0.85
DEFAULT_FALC_CONFIRM = 0.70
DEFAULT_FALC_SOFT = 0.50


@dataclass(frozen=True)
class AdultFrameSignals:
    suggestive_label: Optional[str]
    suggestive_score: Optional[float]
    suggestive_scores: Optional[dict[str, float]]
    falconsai_label: Optional[str]
    falconsai_nsfw_score: Optional[float]
    falconsai_normal_score: Optional[float]
    falconsai_is_nsfw: bool = False


@dataclass(frozen=True)
class AdultFrameDecision:
    state: AdultState
    primary_signal: str
    suggestive_mapped: Optional[AdultState]
    falconsai_mapped: Optional[AdultState]
    reason: str


def normalize_label(label: str | None) -> str:
    return (label or "").strip().lower()


def _score_map(scores: Optional[dict[str, float]]) -> dict[str, float]:
    if not scores:
        return {}
    return {str(k).strip().lower(): float(v) for k, v in scores.items()}


def decide_from_scores(
    scores: Optional[dict[str, float]],
    falconsai_nsfw: float | None,
    *,
    sexy_thr: float = DEFAULT_SEXY_THR,
    porn_suggestive_lo: float = DEFAULT_PORN_SUGGESTIVE_LO,
    porn_explicit: float = DEFAULT_PORN_EXPLICIT,
    falc_confirm: float = DEFAULT_FALC_CONFIRM,
    falc_soft: float = DEFAULT_FALC_SOFT,
) -> tuple[AdultState, str]:
    """Score-policy taxonomy. Returns (state, reason)."""
    s = _score_map(scores)
    if not s and falconsai_nsfw is None:
        return "SAFE", "no_scores"

    safe = float(s.get("safe", 0.0) + s.get("normal", 0.0))
    sexy = float(s.get("sexy", 0.0))
    porn = float(s.get("porn", 0.0))
    hentai = float(s.get("hentai", 0.0))
    drawing = float(s.get("drawing", 0.0))
    explicit_mass = porn + hentai
    adultish = sexy + explicit_mass
    falc = float(falconsai_nsfw or 0.0)

    # EXPLICIT: dual confirmation preferred.
    if explicit_mass >= porn_explicit and falc >= falc_confirm:
        return "EXPLICIT", "porn_and_falconsai"
    if explicit_mass >= 0.95 and falc >= falc_soft:
        return "EXPLICIT", "porn_extreme_falc_soft"

    # SUGGESTIVE: sexy signal, or porn mass without falc confirm, or falc high with adultish mass.
    if sexy >= sexy_thr and sexy >= max(0.15, safe * 0.35):
        return "SUGGESTIVE", "sexy_score"
    if explicit_mass >= porn_suggestive_lo and falc < falc_confirm:
        return "SUGGESTIVE", "porn_mass_no_falc_confirm"
    if falc >= falc_confirm and adultish >= 0.35:
        return "SUGGESTIVE", "falc_with_adultish_mass"
    if falc >= falc_confirm and explicit_mass >= 0.20:
        return "SUGGESTIVE", "falc_with_porn_mass"
    # Falconsai alone is warning-level only (not auto EXPLICIT).
    if falc >= falc_confirm:
        return "SUGGESTIVE", "falconsai_nsfw_alone"

    if safe + drawing >= 0.55 and adultish < porn_suggestive_lo:
        return "SAFE", "safe_dominant"
    return "SAFE", "default_safe"


def map_suggestive_label(
    label: str | None,
    score: float | None = None,
    min_score: float = 0.35,
    scores: Optional[dict[str, float]] = None,
    falconsai_nsfw: float | None = None,
) -> Optional[AdultState]:
    """Backward-compatible helper; prefers full score map when present."""
    if scores is not None or falconsai_nsfw is not None:
        state, _ = decide_from_scores(scores, falconsai_nsfw)
        return state
    normalized = normalize_label(label)
    if not normalized:
        return None
    if score is not None and score < min_score:
        return "SAFE"
    if normalized in {"porn", "hentai"}:
        # Without score map, demote bare top-1 explicit to SUGGESTIVE (calibration).
        return "SUGGESTIVE"
    if normalized == "sexy":
        return "SUGGESTIVE"
    return "SAFE"


def map_falconsai(
    *,
    label: str | None,
    nsfw_score: float | None,
    is_nsfw: bool,
    min_nsfw: float = 0.70,
) -> Optional[AdultState]:
    if label is None and nsfw_score is None:
        return None
    score = float(nsfw_score or 0.0)
    if is_nsfw or (normalize_label(label) == "nsfw" and score >= min_nsfw):
        # Alone, Falconsai only supports SUGGESTIVE unless merged with porn mass upstream.
        return "SUGGESTIVE"
    return "SAFE"


def merge_adult_state(
    suggestive: Optional[AdultState],
    falconsai: Optional[AdultState],
) -> AdultFrameDecision:
    """Legacy merge kept for tests; prefer decide_adult_frame score path."""
    rank = {"SAFE": 0, "SUGGESTIVE": 1, "EXPLICIT": 2}
    s_rank = rank.get(suggestive or "SAFE", 0) if suggestive else -1
    f_rank = rank.get(falconsai or "SAFE", 0) if falconsai else -1

    if s_rank < 0 and f_rank < 0:
        return AdultFrameDecision(
            state="SAFE",
            primary_signal="none",
            suggestive_mapped=suggestive,
            falconsai_mapped=falconsai,
            reason="no_classifiers",
        )

    if max(s_rank, f_rank) <= 0:
        primary = "suggestive" if s_rank >= 0 else "falconsai"
        return AdultFrameDecision(
            state="SAFE",
            primary_signal=primary,
            suggestive_mapped=suggestive,
            falconsai_mapped=falconsai,
            reason="both_safe_or_missing",
        )

    if suggestive == "EXPLICIT":
        return AdultFrameDecision(
            state="EXPLICIT",
            primary_signal="suggestive",
            suggestive_mapped=suggestive,
            falconsai_mapped=falconsai,
            reason="suggestive_explicit",
        )
    if suggestive == "SUGGESTIVE" or falconsai == "SUGGESTIVE":
        primary = "suggestive" if suggestive == "SUGGESTIVE" else "falconsai"
        return AdultFrameDecision(
            state="SUGGESTIVE",
            primary_signal=primary,
            suggestive_mapped=suggestive,
            falconsai_mapped=falconsai,
            reason="suggestive_warning",
        )
    return AdultFrameDecision(
        state="SAFE",
        primary_signal="suggestive" if s_rank >= 0 else "falconsai",
        suggestive_mapped=suggestive,
        falconsai_mapped=falconsai,
        reason="default_safe",
    )


def decide_adult_frame(
    signals: AdultFrameSignals,
    *,
    suggestive_min_score: float = 0.35,
    falconsai_min_nsfw: float = 0.70,
) -> AdultFrameDecision:
    del suggestive_min_score  # unused — score policy replaces top-1 min score
    scores = signals.suggestive_scores
    falc = signals.falconsai_nsfw_score

    if scores is not None or falc is not None:
        state, reason = decide_from_scores(
            scores,
            falc,
            falc_confirm=falconsai_min_nsfw,
        )
        # Mapped views for harness/debug
        sug_only, _ = decide_from_scores(scores, 0.0)
        falc_mapped = map_falconsai(
            label=signals.falconsai_label,
            nsfw_score=falc,
            is_nsfw=signals.falconsai_is_nsfw,
            min_nsfw=falconsai_min_nsfw,
        )
        primary = "suggestive"
        if "falc" in reason or "falconsai" in reason:
            primary = "both" if scores else "falconsai"
        return AdultFrameDecision(
            state=state,
            primary_signal=primary,
            suggestive_mapped=sug_only if scores is not None else None,
            falconsai_mapped=falc_mapped,
            reason=reason,
        )

    # Fallback when only top-1 label available
    suggestive = map_suggestive_label(
        signals.suggestive_label,
        signals.suggestive_score,
    )
    falconsai = map_falconsai(
        label=signals.falconsai_label,
        nsfw_score=signals.falconsai_nsfw_score,
        is_nsfw=signals.falconsai_is_nsfw,
        min_nsfw=falconsai_min_nsfw,
    )
    return merge_adult_state(suggestive, falconsai)
