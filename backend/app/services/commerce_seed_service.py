from __future__ import annotations

import json
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlmodel import Session, select

from app.db.models import Product, Shop, User
from app.services.auth_service import hash_password, normalize_email
from app.services.commerce_service import generate_shop_slug

DEFAULT_SEED_PATH = Path(__file__).resolve().parents[2] / "data" / "commerce_seed_v1.json"


def load_seed_artifact(path: Path | None = None) -> dict[str, Any]:
    seed_path = path or DEFAULT_SEED_PATH
    return json.loads(seed_path.read_text(encoding="utf-8"))


def import_commerce_seed(session: Session, artifact: dict[str, Any] | None = None) -> dict[str, int]:
    """Idempotent import keyed by shop owner email and product (shop, sku)."""
    data = artifact or load_seed_artifact()
    shops_created = products_created = products_updated = 0
    shop_ids: dict[str, Any] = {}
    now = datetime.now(timezone.utc)

    for shop_data in data.get("shops", []):
        email = normalize_email(shop_data["owner_email"])
        user = session.exec(select(User).where(User.email == email)).first()
        if user is None:
            user = User(
                email=email,
                password_hash=hash_password(shop_data["owner_password"]),
                display_name=shop_data.get("owner_display_name") or shop_data["name"],
                role="seller",
            )
            session.add(user)
            session.flush()
        else:
            if not user.display_name:
                user.display_name = shop_data.get("owner_display_name") or shop_data["name"]
                session.add(user)

        shop = session.exec(select(Shop).where(Shop.owner_user_id == user.id)).first()
        if shop is None:
            shop = Shop(
                owner_user_id=user.id,
                name=shop_data["name"],
                slug=shop_data.get("slug") or generate_shop_slug(shop_data["name"]),
                description=shop_data.get("description"),
            )
            session.add(shop)
            session.flush()
            shops_created += 1
        else:
            shop.name = shop_data["name"]
            if shop_data.get("slug"):
                shop.slug = shop_data["slug"]
            shop.description = shop_data.get("description")
            shop.updated_at = now
            session.add(shop)
        shop_ids[shop_data["seed_key"]] = shop.id

    for product_data in data.get("products", []):
        shop_id = shop_ids[product_data["shop_seed_key"]]
        product = session.exec(
            select(Product).where(Product.shop_id == shop_id, Product.sku == product_data["sku"])
        ).first()
        values = {
            "name": product_data["name"],
            "description": product_data.get("description"),
            "category": product_data.get("category") or "fashion",
            "price": Decimal(str(product_data["price"])),
            "stock": int(product_data["stock"]),
            "image_url": product_data.get("image_url"),
            "colors": list(product_data.get("colors") or []),
            "sizes": list(product_data.get("sizes") or []),
            "tags": list(product_data.get("tags") or []),
            "selling_points": list(product_data.get("selling_points") or []),
            "ar_effect_type": product_data.get("ar_effect_type") or "none",
            "source_url": product_data.get("source_url"),
            "is_active": bool(product_data.get("is_active", True)),
            "updated_at": now,
        }
        if product is None:
            product = Product(shop_id=shop_id, sku=product_data["sku"], **values)
            session.add(product)
            products_created += 1
        else:
            for key, value in values.items():
                setattr(product, key, value)
            session.add(product)
            products_updated += 1

    session.commit()
    return {
        "shops_created": shops_created,
        "products_created": products_created,
        "products_updated": products_updated,
        "shop_count": len(data.get("shops", [])),
        "product_count": len(data.get("products", [])),
    }
