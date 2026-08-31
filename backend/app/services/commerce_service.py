from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
import re
import unicodedata
from uuid import UUID, uuid4

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.db.models import (
    Order,
    OrderItem,
    OrderStatus,
    Payment,
    PaymentMethod,
    PaymentStatus,
    Product,
    RoomProduct,
    Shop,
    User,
)
from app.repositories.commerce_repository import CommerceRepository
from app.schemas.commerce import OrderCreate, OrderItemResponse, OrderResponse, ProductWrite


class CommerceError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def owned_shop(repo: CommerceRepository, user: User) -> Shop:
    shop = repo.shop_for_owner(user.id)
    if shop is None:
        raise CommerceError("shop_required", "Create a shop first.", 404)
    return shop


def generate_shop_slug(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    base = re.sub(r"[^a-z0-9]+", "-", normalized.lower()).strip("-") or "shop"
    return f"{base[:150].rstrip('-')}-{uuid4().hex[:6]}"


def create_product(
    session: Session,
    user: User,
    data: ProductWrite,
    *,
    shop_id: UUID | None = None,
) -> Product:
    if shop_id is None:
        shop = owned_shop(CommerceRepository(session), user)
    else:
        # Ownership is decided by the addressed shop so callers without a shop of their own
        # still get 403 instead of a misleading "create a shop first".
        target = session.get(Shop, shop_id)
        if target is None:
            raise CommerceError("shop_not_found", "Shop was not found.", 404)
        if target.owner_user_id != user.id:
            raise CommerceError("shop_forbidden", "This shop belongs to another user.", 403)
        shop = target
    product = Product(shop_id=shop.id, **data.model_dump())
    session.add(product)
    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        raise CommerceError("duplicate_sku", "SKU already exists in this shop.", 409) from error
    session.refresh(product)
    return product


def attach_room_product(
    session: Session, user: User, room_id: str, product_id: UUID, position: int
) -> RoomProduct:
    repo = CommerceRepository(session)
    shop = owned_shop(repo, user)
    room_shop_id = repo.room_shop_id(room_id)
    if room_shop_id is None:
        raise CommerceError("room_not_found", "Active commerce room was not found.", 404)
    if room_shop_id != shop.id:
        raise CommerceError("room_forbidden", "This room is not owned by your shop.", 403)
    product = repo.product(product_id, include_inactive=True)
    if product is None:
        raise CommerceError("product_not_found", "Product was not found.", 404)
    if product.shop_id != shop.id:
        raise CommerceError("shop_mismatch", "Room and product must belong to the same shop.", 409)
    row = session.get(RoomProduct, (room_id, product_id))
    if row is None:
        row = RoomProduct(room_id=room_id, product_id=product_id, position=position)
    else:
        row.position = position
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def create_order(session: Session, buyer: User, data: OrderCreate) -> OrderResponse:
    requested: dict[UUID, int] = {}
    for item in data.items:
        requested[item.product_id] = requested.get(item.product_id, 0) + item.quantity
    products = list(
        session.exec(
            select(Product)
            .where(Product.id.in_(list(requested)), Product.is_active.is_(True))
            .with_for_update()
        ).all()
    )
    if len(products) != len(requested):
        raise CommerceError("product_not_found", "One or more products are unavailable.", 404)
    shop_ids = {product.shop_id for product in products}
    if len(shop_ids) != 1:
        raise CommerceError("multiple_shops", "An order may contain products from one shop only.", 409)
    for product in products:
        if product.stock < requested[product.id]:
            raise CommerceError("insufficient_stock", f"Insufficient stock for '{product.name}'.", 409)

    total = sum(
        (product.price * requested[product.id] for product in products),
        start=Decimal("0.00"),
    )
    order = Order(
        buyer_user_id=buyer.id,
        shop_id=next(iter(shop_ids)),
        room_id=data.room_id,
        total_amount=total,
        shipping_name=data.shipping_name.strip(),
        shipping_address=data.shipping_address.strip(),
        phone=data.phone.strip() if data.phone else None,
    )
    session.add(order)
    session.flush()
    items: list[OrderItem] = []
    for product in products:
        quantity = requested[product.id]
        product.stock -= quantity
        item = OrderItem(
            order_id=order.id,
            product_id=product.id,
            product_name=product.name,
            quantity=quantity,
            unit_price=product.price,
            line_total=product.price * quantity,
        )
        session.add(product)
        session.add(item)
        items.append(item)
    session.commit()
    session.refresh(order)
    return order_response(order, items)


def order_response(order: Order, items: list[OrderItem]) -> OrderResponse:
    status_value = order.status.value if hasattr(order.status, "value") else str(order.status)
    return OrderResponse(
        id=order.id,
        buyer_user_id=order.buyer_user_id,
        shop_id=order.shop_id,
        room_id=order.room_id,
        status=status_value,
        total_amount=order.total_amount,
        shipping_name=order.shipping_name,
        shipping_address=order.shipping_address,
        phone=order.phone,
        created_at=order.created_at,
        items=[OrderItemResponse.model_validate(item) for item in items],
    )


def create_payment(session: Session, buyer: User, order_id: UUID, method: str) -> Payment:
    repo = CommerceRepository(session)
    order, _ = repo.order_with_items(order_id)
    if order is None:
        raise CommerceError("order_not_found", "Order was not found.", 404)
    if order.buyer_user_id != buyer.id:
        raise CommerceError("order_forbidden", "This order belongs to another user.", 403)
    existing = repo.payment_for_order(order_id)
    if existing is not None:
        return existing
    if order.status != OrderStatus.PENDING_PAYMENT:
        raise CommerceError("invalid_order_state", "Order cannot be paid in its current state.", 409)
    payment_method = PaymentMethod(method)
    payment = Payment(
        order_id=order.id,
        method=payment_method,
        status=PaymentStatus.SUCCEEDED if payment_method == PaymentMethod.COD else PaymentStatus.PENDING,
        amount=order.total_amount,
        transaction_ref=(
            f"{payment_method.value.upper()}-{uuid4().hex[:16]}"
            if payment_method == PaymentMethod.SANDBOX
            else None
        ),
    )
    if payment_method == PaymentMethod.COD:
        order.status = OrderStatus.CONFIRMED
        order.updated_at = datetime.now(timezone.utc)
        session.add(order)
    session.add(payment)
    session.commit()
    session.refresh(payment)
    return payment


def apply_sandbox_result(session: Session, buyer: User, payment_id: UUID, result: str) -> Payment:
    payment = session.get(Payment, payment_id)
    if payment is None:
        raise CommerceError("payment_not_found", "Payment was not found.", 404)
    order, items = CommerceRepository(session).order_with_items(payment.order_id)
    if order is None or order.buyer_user_id != buyer.id:
        raise CommerceError("payment_forbidden", "This payment belongs to another user.", 403)
    if payment.method != PaymentMethod.SANDBOX:
        raise CommerceError("invalid_payment_method", "Only sandbox payments accept results.", 409)
    if payment.status != PaymentStatus.PENDING:
        return payment
    now = datetime.now(timezone.utc)
    if result == "success":
        payment.status = PaymentStatus.SUCCEEDED
        order.status = OrderStatus.CONFIRMED
    else:
        payment.status = PaymentStatus.FAILED
        order.status = OrderStatus.CANCELLED
        for item in items:
            product = session.exec(
                select(Product).where(Product.id == item.product_id).with_for_update()
            ).one()
            product.stock += item.quantity
            session.add(product)
    payment.updated_at = now
    order.updated_at = now
    session.add(payment)
    session.add(order)
    session.commit()
    session.refresh(payment)
    return payment
