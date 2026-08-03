from __future__ import annotations

from typing import FrozenSet

# Source: smart-livestream-ml/schemas/livestream_v3_labels.schema.json (11 ML intents)
VALID_ML_INTENT_LABELS: FrozenSet[str] = frozenset(
    {
        "ASK_PRICE",
        "ASK_STOCK",
        "ASK_VARIANT",
        "ASK_LINK",
        "ASK_SHIPPING",
        "ASK_PROMOTION",
        "PRODUCT_INFO",
        "PURCHASE_INTENT",
        "CHITCHAT",
        "COMPLAINT",
        "SPAM_TOXIC",
    }
)


def is_valid_ml_intent_label(value: str) -> bool:
    return value.strip().upper() in VALID_ML_INTENT_LABELS
