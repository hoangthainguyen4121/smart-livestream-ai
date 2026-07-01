from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Any, Literal

ProductContextSource = Literal[
    "camera_context",
    "pinned_product",
    "catalog_match",
    "clarification",
]

DEICTIC_PATTERNS = (
    r"\bcai nay\b",
    r"\bmon nay\b",
    r"\bsan pham nay\b",
    r"\bcai dang cam\b",
    r"\bmau nay\b",
    r"\bem nay\b",
)

CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "glasses": ["kinh", "mat kinh", "glasses"],
    "lipstick": ["son", "son moi", "lipstick"],
    "accessory": ["phu kien", "vuong mien", "crown", "mu bucket", "mu"],
    "skincare": ["kem chong nang", "skincare", "spf", "chong nang"],
    "electronics": ["tai nghe", "bluetooth", "headphones"],
    "fashion": ["ao thun", "tui deo cheo", "oversize", "thun"],
}

CLARIFICATION_QUESTION = (
    "Bạn đang hỏi về sản phẩm nào ạ? "
    "Bạn có thể nêu tên sản phẩm hoặc host ghim sản phẩm trên livestream."
)


@dataclass(frozen=True)
class ProductMatch:
    product: dict[str, Any]
    score: int
    matched_terms: list[str]


@dataclass(frozen=True)
class ProductContextResolution:
    product: dict[str, Any] | None
    source: ProductContextSource
    confidence: float
    explanation: str
    clarification_question: str | None
    is_clarification: bool


def normalize_text(text: str) -> str:
    normalized = unicodedata.normalize("NFD", text.lower())
    without_marks = "".join(
        character for character in normalized if unicodedata.category(character) != "Mn"
    )
    cleaned = re.sub(r"[^\w\s]", " ", without_marks)
    return re.sub(r"\s+", " ", cleaned).strip()


def normalize_token(value: str) -> str:
    return normalize_text(value)


def contains_term(text: str, term: str) -> bool:
    if not term:
        return False
    tokens = text.split()
    if len(term) <= 4:
        return term in tokens
    return term in text


def score_product(product: dict[str, Any], text: str) -> ProductMatch:
    terms = [
        normalize_token(product["name"]),
        normalize_token(product["id"].replace("-", " ")),
        *[normalize_token(tag) for tag in product.get("tags", [])],
        *[normalize_token(color) for color in product.get("colors", [])],
        *(CATEGORY_KEYWORDS.get(product.get("category", ""), [])),
    ]

    matched_terms: list[str] = []
    score = 0
    for term in terms:
        if not term or len(term) < 2 or not contains_term(text, term):
            continue
        matched_terms.append(term)
        if term == normalize_token(product["name"]):
            score += 5
        elif len(term) >= 8:
            score += 3
        elif len(term) >= 4:
            score += 2
        else:
            score += 1

    category = product.get("category", "")
    for keyword in CATEGORY_KEYWORDS.get(category, []):
        if contains_term(text, keyword) and keyword not in matched_terms:
            matched_terms.append(keyword)
            score += 2

    return ProductMatch(product, score, list(dict.fromkeys(matched_terms)))


def rank_products(comment: str, catalog: list[dict[str, Any]]) -> list[ProductMatch]:
    text = normalize_text(comment)
    return sorted(
        (score_product(product, text) for product in catalog),
        key=lambda entry: entry.score,
        reverse=True,
    )


def is_explicit_product_mention(match: ProductMatch, comment: str) -> bool:
    text = normalize_text(comment)
    product_name = normalize_token(match.product["name"])
    if product_name in match.matched_terms:
        return True

    specific_tags = [
        normalize_token(tag)
        for tag in match.product.get("tags", [])
        if len(tag) >= 5
    ]
    if any(tag in match.matched_terms for tag in specific_tags):
        return True

    matched_product_color = next(
        (
            color
            for color in (normalize_token(value) for value in match.product.get("colors", []))
            if color and contains_term(text, color)
        ),
        None,
    )
    if matched_product_color:
        category = match.product.get("category", "")
        category_keywords = CATEGORY_KEYWORDS.get(category, [])
        has_category_hint = any(contains_term(text, keyword) for keyword in category_keywords)
        has_short_category_token = category == "fashion" and contains_term(text, "ao")
        if has_category_hint or has_short_category_token:
            return True

    return match.score >= 5


def find_explicit_catalog_match(
    comment: str,
    catalog: list[dict[str, Any]],
) -> ProductMatch | None:
    ranked = [entry for entry in rank_products(comment, catalog) if entry.score > 0]
    explicit = [entry for entry in ranked if is_explicit_product_mention(entry, comment)]
    return explicit[0] if explicit else None


def find_confident_catalog_candidate(
    comment: str,
    catalog: list[dict[str, Any]],
    minimum_score: int = 3,
) -> ProductMatch | None:
    ranked = [entry for entry in rank_products(comment, catalog) if entry.score > 0]
    if not ranked:
        return None
    best = ranked[0]
    if best.score < minimum_score:
        return None
    if len(ranked) >= 2 and abs(best.score - ranked[1].score) <= 1:
        return None
    return best


def has_deictic_product_reference(comment: str) -> bool:
    text = normalize_text(comment)
    return any(re.search(pattern, text) for pattern in DEICTIC_PATTERNS)


def find_product_by_id(
    catalog: list[dict[str, Any]],
    product_id: str | None,
) -> dict[str, Any] | None:
    if not product_id:
        return None
    return next((product for product in catalog if product["id"] == product_id), None)


def resolve_product_context(
    comment: str,
    catalog: list[dict[str, Any]],
    pinned_product_id: str | None = None,
    selected_camera_product_id: str | None = None,
    latest_camera_product_id: str | None = None,
) -> ProductContextResolution:
    explicit_match = find_explicit_catalog_match(comment, catalog)
    if explicit_match:
        return ProductContextResolution(
            product=explicit_match.product,
            source="catalog_match",
            confidence=min(0.98, 0.82 + explicit_match.score * 0.03),
            explanation=(
                "Explicit catalog match via "
                f"{', '.join(explicit_match.matched_terms) or 'product terms'}."
            ),
            clarification_question=None,
            is_clarification=False,
        )

    if has_deictic_product_reference(comment):
        camera_product = find_product_by_id(
            catalog,
            selected_camera_product_id or latest_camera_product_id,
        )
        if camera_product:
            return ProductContextResolution(
                product=camera_product,
                source="camera_context",
                confidence=0.88,
                explanation=(
                    f'Deictic reference resolved to camera product "{camera_product["name"]}".'
                ),
                clarification_question=None,
                is_clarification=False,
            )

        pinned_product = find_product_by_id(catalog, pinned_product_id)
        if pinned_product:
            return ProductContextResolution(
                product=pinned_product,
                source="pinned_product",
                confidence=0.72,
                explanation=(
                    f'Deictic reference resolved to pinned product "{pinned_product["name"]}" '
                    "(no camera product)."
                ),
                clarification_question=None,
                is_clarification=False,
            )

        return ProductContextResolution(
            product=None,
            source="clarification",
            confidence=0.35,
            explanation="Deictic reference without camera or pinned product context.",
            clarification_question=CLARIFICATION_QUESTION,
            is_clarification=True,
        )

    pinned_product = find_product_by_id(catalog, pinned_product_id)
    if pinned_product:
        return ProductContextResolution(
            product=pinned_product,
            source="pinned_product",
            confidence=0.65,
            explanation=f'No explicit product mention; using pinned product "{pinned_product["name"]}".',
            clarification_question=None,
            is_clarification=False,
        )

    catalog_candidate = find_confident_catalog_candidate(comment, catalog)
    if catalog_candidate:
        return ProductContextResolution(
            product=catalog_candidate.product,
            source="catalog_match",
            confidence=min(0.9, 0.7 + catalog_candidate.score * 0.04),
            explanation=(
                f'Catalog candidate "{catalog_candidate.product["name"]}" '
                "above confidence threshold."
            ),
            clarification_question=None,
            is_clarification=False,
        )

    return ProductContextResolution(
        product=None,
        source="clarification",
        confidence=0.35,
        explanation="No product context and no confident catalog match.",
        clarification_question=CLARIFICATION_QUESTION,
        is_clarification=True,
    )
