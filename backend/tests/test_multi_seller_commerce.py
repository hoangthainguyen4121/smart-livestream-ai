from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from io import BytesIO
from pathlib import Path
import sys
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from PIL import Image

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.main import app
from app.services.commerce_seed_service import import_commerce_seed, load_seed_artifact
from app.services.memory_live_sessions import get_memory_live_session_store


def test_seed_artifact_shape() -> None:
    artifact = load_seed_artifact()
    assert artifact["version"] == "commerce-seed-v1"
    assert len(artifact["shops"]) >= 5
    assert len(artifact["products"]) >= 90
    product = artifact["products"][0]
    assert {"sku", "name", "price", "stock", "shop_seed_key", "category"} <= set(product)



@pytest.fixture()
def client(feedback_env: str, db_session_feedback) -> TestClient:
    get_memory_live_session_store().clear()
    return TestClient(app)


def auth_headers(client: TestClient, email: str, password: str = "password123", display_name: str | None = None) -> dict[str, str]:
    payload = {"email": email, "password": password}
    if display_name:
        payload["display_name"] = display_name
    register = client.post("/api/auth/register", json=payload)
    if register.status_code == 409:
        login = client.post("/api/auth/login", json={"email": email, "password": password})
        assert login.status_code == 200, login.text
        token = login.json()["access_token"]
    else:
        assert register.status_code == 201, register.text
        token = register.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def create_shop(client: TestClient, headers: dict[str, str], name: str = "Demo Shop") -> dict:
    response = client.post("/api/shops", json={"name": name, "description": "test"}, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def create_product(client: TestClient, headers: dict[str, str], shop_id: str, **overrides) -> dict:
    payload = {
        "sku": overrides.pop("sku", f"SKU-{uuid4().hex[:8]}"),
        "name": "Live Tee",
        "description": "Demo product",
        "category": "fashion",
        "price": "199000.00",
        "stock": 5,
        "colors": ["Đen"],
        "sizes": ["M"],
        "tags": ["ao"],
        "selling_points": ["Cotton"],
        "ar_effect_type": "none",
    }
    payload.update(overrides)
    response = client.post(f"/api/shops/{shop_id}/products", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def test_seller_can_upload_product_image(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    headers = auth_headers(client, f"image-{uuid4().hex[:8]}@example.com")
    create_shop(client, headers, "Image Shop")
    monkeypatch.setenv("PRODUCT_IMAGE_DIR", str(tmp_path))
    output = BytesIO()
    Image.new("RGB", (40, 30), (45, 90, 210)).save(output, format="PNG")

    anonymous = client.post(
        "/api/products/images",
        files={"image": ("product.png", output.getvalue(), "image/png")},
    )
    uploaded = client.post(
        "/api/products/images",
        files={"image": ("product.png", output.getvalue(), "image/png")},
        headers=headers,
    )

    assert anonymous.status_code == 401
    assert uploaded.status_code == 201, uploaded.text
    image_url = uploaded.json()["image_url"]
    assert image_url.startswith("/media/product-images/")
    assert (tmp_path / image_url.rsplit("/", 1)[-1]).is_file()


def test_register_login_me_and_duplicate_email(client: TestClient) -> None:
    email = f"seller-{uuid4().hex[:8]}@example.com"
    first = client.post(
        "/api/auth/register",
        json={"email": email, "password": "password123", "display_name": "Seller A"},
    )
    assert first.status_code == 201
    assert first.json()["user"]["display_name"] == "Seller A"
    duplicate = client.post("/api/auth/register", json={"email": email, "password": "password123"})
    assert duplicate.status_code == 409
    login = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert login.status_code == 200
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {login.json()['access_token']}"})
    assert me.status_code == 200
    assert me.json()["email"] == email


def test_social_room_needs_no_shop_but_commerce_room_needs_shop_and_product(
    client: TestClient,
) -> None:
    owner = auth_headers(client, f"social-{uuid4().hex[:8]}@example.com")

    social = client.post(
        "/api/live-sessions",
        json={"name": "Talk Room", "room_type": "chat"},
        headers=owner,
    )
    assert social.status_code == 201, social.text
    assert social.json()["shop_id"] is None

    no_shop = client.post(
        "/api/live-sessions",
        json={"name": "Fashion Room", "room_type": "fashion", "product_ids": []},
        headers=owner,
    )
    assert no_shop.status_code == 409

    shop = create_shop(client, owner, "Conditional Commerce")
    no_product = client.post(
        "/api/live-sessions",
        json={"name": "Fashion Room", "room_type": "fashion", "product_ids": []},
        headers=owner,
    )
    assert no_product.status_code == 422

    product = create_product(client, owner, shop["id"], sku="CONDITIONAL-1")
    commerce = client.post(
        "/api/live-sessions",
        json={
            "name": "Fashion Room",
            "room_type": "fashion",
            "product_ids": [product["id"]],
        },
        headers=owner,
    )
    assert commerce.status_code == 201, commerce.text
    assert commerce.json()["shop_id"] == shop["id"]


def test_unauthorized_shop_mutation_and_cross_seller_product(client: TestClient) -> None:
    seller_a = auth_headers(client, f"a-{uuid4().hex[:8]}@example.com")
    seller_b = auth_headers(client, f"b-{uuid4().hex[:8]}@example.com")
    shop_a = create_shop(client, seller_a, "Shop A")
    product = create_product(client, seller_a, shop_a["id"], sku="A-1")

    forbidden_shop = client.post(
        f"/api/shops/{shop_a['id']}/products",
        json={
            "sku": "B-HACK",
            "name": "Hack",
            "price": "1.00",
            "stock": 1,
        },
        headers=seller_b,
    )
    assert forbidden_shop.status_code == 403

    forbidden_patch = client.patch(
        f"/api/products/{product['id']}",
        json={"name": "Stolen"},
        headers=seller_b,
    )
    assert forbidden_patch.status_code == 403


def test_session_end_and_moderation_are_bound_to_seller(client: TestClient) -> None:
    seller_a = auth_headers(client, f"session-a-{uuid4().hex[:8]}@example.com")
    seller_b = auth_headers(client, f"session-b-{uuid4().hex[:8]}@example.com")
    create_shop(client, seller_a, "Session Shop A")
    create_shop(client, seller_b, "Session Shop B")

    end_room = client.post(
        "/api/live-sessions",
        json={"name": "Owner End Room", "room_type": "general"},
        headers=seller_a,
    ).json()
    assert client.post(
        f"/api/live-sessions/{end_room['id']}/end",
        headers=seller_b,
    ).status_code == 403
    assert client.post(f"/api/live-sessions/{end_room['id']}/end").status_code == 401
    owner_end = client.post(
        f"/api/live-sessions/{end_room['id']}/end",
        headers=seller_a,
    )
    assert owner_end.status_code == 200
    assert owner_end.json()["status"] == "ended"

    moderation_room = client.post(
        "/api/live-sessions",
        json={"name": "Owner Moderation Room", "room_type": "general"},
        headers=seller_a,
    ).json()
    violation = {
        "code": "sharp_object_detected",
        "label": "knife",
        "confidence": 0.9,
        "evidence_count": 3,
        "window_ms": 5000,
        "detected_at": datetime.now(timezone.utc).isoformat(),
    }
    assert client.post(
        f"/api/live-sessions/{moderation_room['id']}/moderation-violations",
        json=violation,
        headers=seller_b,
    ).status_code == 403
    assert client.post(
        f"/api/live-sessions/{moderation_room['id']}/moderation-violations",
        json=violation,
    ).status_code == 401
    owner_report = client.post(
        f"/api/live-sessions/{moderation_room['id']}/moderation-violations",
        json=violation,
        headers=seller_a,
    )
    assert owner_report.status_code == 200
    assert owner_report.json()["status"] == "ended"


def test_room_attach_same_shop_only_and_order_uses_server_price(client: TestClient) -> None:
    seller = auth_headers(client, f"host-{uuid4().hex[:8]}@example.com")
    buyer = auth_headers(client, f"buyer-{uuid4().hex[:8]}@example.com")
    other = auth_headers(client, f"other-{uuid4().hex[:8]}@example.com")
    shop = create_shop(client, seller)
    other_shop = create_shop(client, other, "Other Shop")
    product = create_product(client, seller, shop["id"], sku="ROOM-1", price="250000.00", stock=3)
    foreign = create_product(client, other, other_shop["id"], sku="ROOM-X", price="10.00", stock=3)

    room = client.post(
        "/api/live-sessions",
        json={
            "name": "Seller Live",
            "room_type": "fashion",
            "product_ids": [product["id"]],
        },
        headers=seller,
    )
    assert room.status_code == 201, room.text
    room_id = room.json()["room_id"]

    ok = client.post(
        f"/api/rooms/{room_id}/products",
        json={"product_id": product["id"]},
        headers=seller,
    )
    assert ok.status_code == 200, ok.text
    bad = client.post(
        f"/api/rooms/{room_id}/products",
        json={"product_id": foreign["id"]},
        headers=seller,
    )
    assert bad.status_code in {403, 409}

    listed = client.get(f"/api/rooms/{room_id}/products")
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [product["id"]]
    listed_by_query = client.get("/api/products", params={"room_id": room_id})
    assert listed_by_query.status_code == 200
    assert listed_by_query.json()[0]["position"] == 0
    unpinned = client.post(
        f"/api/rooms/{room_id}/products/pin",
        json={"product_id": None},
        headers=seller,
    )
    assert unpinned.status_code == 200
    assert unpinned.json() is None

    order = client.post(
        "/api/orders",
        json={
            "shipping_name": "Buyer",
            "shipping_address": "HCM",
            "phone": "0901111222",
            "room_id": room_id,
            "items": [
                {"product_id": product["id"], "quantity": 2, "unit_price": "1.00"}
            ],
        },
        headers=buyer,
    )
    assert order.status_code == 201, order.text
    body = order.json()
    assert Decimal(str(body["total_amount"])) == Decimal("500000.00")
    assert body["items"][0]["unit_price"] == "250000.00"

    stock = client.get(f"/api/products/{product['id']}").json()["stock"]
    assert stock == 1

    oversell = client.post(
        "/api/orders",
        json={
            "shipping_name": "Buyer",
            "shipping_address": "HCM",
            "items": [{"product_id": product["id"], "quantity": 5}],
        },
        headers=buyer,
    )
    assert oversell.status_code == 409


def test_payment_sandbox_success_and_fail(client: TestClient) -> None:
    seller = auth_headers(client, f"pay-s-{uuid4().hex[:8]}@example.com")
    buyer = auth_headers(client, f"pay-b-{uuid4().hex[:8]}@example.com")
    shop = create_shop(client, seller)
    product = create_product(client, seller, shop["id"], sku="PAY-1", price="1000.00", stock=2)

    order = client.post(
        "/api/orders",
        json={
            "shipping_name": "Buyer",
            "shipping_address": "HN",
            "items": [{"product_id": product["id"], "quantity": 1}],
        },
        headers=buyer,
    ).json()

    payment = client.post(
        f"/api/orders/{order['id']}/payments",
        json={"method": "sandbox"},
        headers=buyer,
    )
    assert payment.status_code == 201, payment.text
    forbidden = client.post(
        f"/api/orders/{order['id']}/payments",
        json={"method": "sandbox"},
        headers=seller,
    )
    assert forbidden.status_code == 403
    success = client.post(
        f"/api/payments/{payment.json()['id']}/sandbox-result",
        json={"result": "success"},
        headers=buyer,
    )
    assert success.status_code == 200
    assert success.json()["status"] == "succeeded"

    order2 = client.post(
        "/api/orders",
        json={
            "shipping_name": "Buyer",
            "shipping_address": "HN",
            "items": [{"product_id": product["id"], "quantity": 1}],
        },
        headers=buyer,
    ).json()
    payment2 = client.post(
        f"/api/orders/{order2['id']}/payments",
        json={"method": "sandbox"},
        headers=buyer,
    ).json()
    failed = client.post(
        f"/api/payments/{payment2['id']}/sandbox-result",
        json={"result": "failure"},
        headers=buyer,
    )
    assert failed.status_code == 200
    assert failed.json()["status"] == "failed"
    restored = client.get(f"/api/products/{product['id']}").json()["stock"]
    assert restored == 1


def test_seed_import_is_idempotent(db_session_feedback) -> None:
    artifact = load_seed_artifact()
    first = import_commerce_seed(db_session_feedback, artifact)
    second = import_commerce_seed(db_session_feedback, artifact)
    assert first["product_count"] >= 90
    assert first["shop_count"] >= 5
    assert second["products_created"] == 0
    assert second["products_updated"] == first["product_count"]
