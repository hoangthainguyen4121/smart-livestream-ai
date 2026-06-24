from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MappedMlIntent:
    mapped_intent: str
    mapped_action: str
    suppress_event: bool = False
    is_complaint_escalation: bool = False
    is_spam_moderation: bool = False


ML_INTENT_MAP: dict[str, tuple[str, str]] = {
    "ASK_PRICE": ("ASK_PRICE", "AUTO_REPLY_SUGGESTED"),
    "ASK_VARIANT": ("ASK_SIZE", "AUTO_REPLY_SUGGESTED"),
    "ASK_STOCK": ("ASK_STOCK", "AUTO_REPLY_SUGGESTED"),
    "ASK_LINK": ("ASK_LINK", "AUTO_REPLY_SUGGESTED"),
    "ASK_SHIPPING": ("ASK_SHIPPING", "AUTO_REPLY_SUGGESTED"),
    "ASK_PROMOTION": ("ASK_PROMOTION", "AUTO_REPLY_SUGGESTED"),
    "PRODUCT_INFO": ("ASK_PRODUCT_INFO", "AUTO_REPLY_SUGGESTED"),
    "PURCHASE_INTENT": ("PURCHASE_INTENT", "ESCALATE_TO_HOST"),
}


def map_ml_intent(ml_intent: str) -> MappedMlIntent:
    normalized = ml_intent.strip().upper()

    if normalized == "CHITCHAT":
        return MappedMlIntent(
            mapped_intent="UNKNOWN",
            mapped_action="IGNORE",
            suppress_event=True,
        )

    if normalized == "SPAM_TOXIC":
        return MappedMlIntent(
            mapped_intent="UNKNOWN",
            mapped_action="IGNORE",
            suppress_event=True,
            is_spam_moderation=True,
        )

    if normalized == "COMPLAINT":
        return MappedMlIntent(
            mapped_intent="ASK_PRODUCT_INFO",
            mapped_action="ESCALATE_TO_HOST",
            is_complaint_escalation=True,
        )

    mapped = ML_INTENT_MAP.get(normalized)
    if mapped is None:
        return MappedMlIntent(
            mapped_intent="UNKNOWN",
            mapped_action="IGNORE",
            suppress_event=True,
        )

    mapped_intent, mapped_action = mapped
    return MappedMlIntent(
        mapped_intent=mapped_intent,
        mapped_action=mapped_action,
    )
