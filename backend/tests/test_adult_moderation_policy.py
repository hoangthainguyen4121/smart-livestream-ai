"""Unit tests for SAFE | SUGGESTIVE | EXPLICIT score-based policy (no model load)."""

from __future__ import annotations

from app.services.adult_moderation_policy import (
    AdultFrameSignals,
    decide_adult_frame,
    decide_from_scores,
    map_falconsai,
    map_suggestive_label,
    merge_adult_state,
)


def test_map_suggestive_labels_without_scores_demotes_porn():
    assert map_suggestive_label("safe", 0.9) == "SAFE"
    assert map_suggestive_label("sexy", 0.7) == "SUGGESTIVE"
    # Bare top-1 porn is demoted (Breathless FP calibration).
    assert map_suggestive_label("porn", 0.8) == "SUGGESTIVE"
    assert map_suggestive_label("sexy", 0.2) == "SAFE"


def test_score_policy_lingerie_to_suggestive_not_blind_explicit():
    state, reason = decide_from_scores(
        {"safe": 0.02, "sexy": 0.06, "porn": 0.81, "hentai": 0.0, "drawing": 0.0},
        falconsai_nsfw=0.40,
    )
    assert state == "SUGGESTIVE"
    assert "porn" in reason


def test_score_policy_dual_confirm_explicit():
    state, reason = decide_from_scores(
        {"safe": 0.0, "sexy": 0.0, "porn": 0.98, "hentai": 0.0, "drawing": 0.0},
        falconsai_nsfw=0.90,
    )
    assert state == "EXPLICIT"
    assert "falconsai" in reason or "porn" in reason


def test_score_policy_falc_high_mid_porn_suggestive():
    state, _ = decide_from_scores(
        {"safe": 0.42, "sexy": 0.03, "porn": 0.52, "hentai": 0.0, "drawing": 0.0},
        falconsai_nsfw=0.98,
    )
    assert state == "SUGGESTIVE"


def test_score_policy_safe_dominant():
    state, _ = decide_from_scores(
        {"safe": 0.96, "sexy": 0.01, "porn": 0.01, "hentai": 0.0, "drawing": 0.02},
        falconsai_nsfw=0.0,
    )
    assert state == "SAFE"


def test_map_falconsai_alone_is_suggestive_not_auto_explicit():
    assert map_falconsai(label="nsfw", nsfw_score=0.9, is_nsfw=True) == "SUGGESTIVE"
    assert map_falconsai(label="normal", nsfw_score=0.1, is_nsfw=False) == "SAFE"


def test_merge_suggestive_warning():
    decision = merge_adult_state("SUGGESTIVE", "SAFE")
    assert decision.state == "SUGGESTIVE"


def test_decide_adult_frame_uses_score_map():
    decision = decide_adult_frame(
        AdultFrameSignals(
            suggestive_label="porn",
            suggestive_score=0.82,
            suggestive_scores={"sexy": 0.7, "safe": 0.1, "porn": 0.1, "hentai": 0.0, "drawing": 0.0},
            falconsai_label="normal",
            falconsai_nsfw_score=0.01,
            falconsai_normal_score=0.99,
            falconsai_is_nsfw=False,
        )
    )
    assert decision.state == "SUGGESTIVE"
