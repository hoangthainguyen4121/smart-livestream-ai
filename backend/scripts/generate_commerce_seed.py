from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "commerce_seed_v1.json"

SHOPS = [
    {
        "seed_key": "shop-fashion-01",
        "slug": "aurora-fashion",
        "name": "Aurora Fashion",
        "description": "Everyday fashion for livestream demos",
        "owner_email": "seller1@example.com",
        "owner_password": "password123",
    },
    {
        "seed_key": "shop-beauty-02",
        "slug": "coral-beauty",
        "name": "Coral Beauty",
        "description": "Makeup and skincare sample catalog",
        "owner_email": "seller2@example.com",
        "owner_password": "password123",
    },
    {
        "seed_key": "shop-gadget-03",
        "slug": "neon-gadgets",
        "name": "Neon Gadgets",
        "description": "Accessories and small electronics",
        "owner_email": "seller3@example.com",
        "owner_password": "password123",
    },
    {
        "seed_key": "shop-home-04",
        "slug": "harbor-home",
        "name": "Harbor Home",
        "description": "Home and lifestyle products",
        "owner_email": "seller4@example.com",
        "owner_password": "password123",
    },
    {
        "seed_key": "shop-sport-05",
        "slug": "pulse-sport",
        "name": "Pulse Sport",
        "description": "Fitness and outdoor gear",
        "owner_email": "seller5@example.com",
        "owner_password": "password123",
    },
    {
        "seed_key": "shop-kids-06",
        "slug": "little-orbit",
        "name": "Little Orbit",
        "description": "Kids and family essentials",
        "owner_email": "seller6@example.com",
        "owner_password": "password123",
    },
    {
        "seed_key": "shop-pet-07",
        "slug": "paw-lane",
        "name": "Paw Lane",
        "description": "Pet care basics",
        "owner_email": "seller7@example.com",
        "owner_password": "password123",
    },
]

CATEGORIES = [
    ("fashion", "Tee", "shirt"),
    ("fashion", "Hat", "hat"),
    ("beauty", "Lipstick", "makeup"),
    ("beauty", "Serum", "skincare"),
    ("gadget", "Headset", "audio"),
    ("gadget", "Case", "accessory"),
    ("home", "Mug", "kitchen"),
    ("home", "Candle", "decor"),
    ("sport", "Band", "fitness"),
    ("sport", "Bottle", "hydrate"),
    ("kids", "Toy", "play"),
    ("pet", "Treat", "care"),
]


def main() -> None:
    products = []
    for index in range(1, 101):
        shop = SHOPS[(index - 1) % len(SHOPS)]
        category, noun, tag = CATEGORIES[(index - 1) % len(CATEGORIES)]
        sku = f"{shop['seed_key'][-2:].upper()}-{index:03d}"
        products.append(
            {
                "seed_key": f"product-{index:03d}",
                "shop_seed_key": shop["seed_key"],
                "sku": sku,
                "name": f"{noun} {index:03d}",
                "description": (
                    f"Normalized demo {tag} item #{index} for multi-seller commerce PoC."
                ),
                "category": category,
                # Catalog prices are VND; keep realistic demo values (95,000–755,000đ).
                "price": int(
                    round(9.5 + (index % 20) * 3.25 + (index % 7) * 0.5, 2)
                    * 10_000
                ),
                "stock": 10 + (index % 40),
                "image_url": f"/seed/{tag}/{index:03d}.svg",
                "colors": [],
                "sizes": [],
                "tags": [tag],
                "selling_points": [f"Demo {tag}"],
                "ar_effect_type": "none",
                "is_active": True,
            }
        )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    artifact = {"version": "commerce-seed-v1", "shops": SHOPS, "products": products}
    OUT.write_text(json.dumps(artifact, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT} shops={len(SHOPS)} products={len(products)}")


if __name__ == "__main__":
    main()
