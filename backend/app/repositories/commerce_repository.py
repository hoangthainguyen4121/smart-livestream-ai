from __future__ import annotations

from typing import Optional
from uuid import UUID

from sqlmodel import Session, select

from app.db.models import Order, OrderItem, Payment, Product, RoomProduct, Shop, User


class CommerceRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def shop_for_owner(self, user_id: UUID) -> Optional[Shop]:
        return self.session.exec(select(Shop).where(Shop.owner_user_id == user_id)).first()

    def product(self, product_id: UUID, *, include_inactive: bool = False) -> Optional[Product]:
        statement = select(Product).where(Product.id == product_id)
        if not include_inactive:
            statement = statement.where(Product.is_active.is_(True))
        return self.session.exec(statement).first()

    def products(self, shop_id: Optional[UUID] = None) -> list[Product]:
        statement = select(Product).where(Product.is_active.is_(True))
        if shop_id is not None:
            statement = statement.where(Product.shop_id == shop_id)
        return list(self.session.exec(statement.order_by(Product.created_at.desc())).all())

    def room_shop_id(self, room_id: str) -> Optional[UUID]:
        from app.services.live_session_moderation import get_active_live_session

        live = get_active_live_session(room_id, reap=False)
        return getattr(live, "shop_id", None) if live else None

    def room_products(self, room_id: str) -> list[tuple[RoomProduct, Product]]:
        statement = (
            select(RoomProduct, Product)
            .join(Product, Product.id == RoomProduct.product_id)
            .where(RoomProduct.room_id == room_id, Product.is_active.is_(True))
            .order_by(RoomProduct.is_pinned.desc(), RoomProduct.position, RoomProduct.attached_at)
        )
        return list(self.session.exec(statement).all())

    def order_with_items(self, order_id: UUID) -> tuple[Optional[Order], list[OrderItem]]:
        order = self.session.get(Order, order_id)
        items = list(
            self.session.exec(select(OrderItem).where(OrderItem.order_id == order_id)).all()
        ) if order else []
        return order, items

    def payment_for_order(self, order_id: UUID) -> Optional[Payment]:
        return self.session.exec(select(Payment).where(Payment.order_id == order_id)).first()

    def user_by_email(self, email: str) -> Optional[User]:
        return self.session.exec(select(User).where(User.email == email)).first()
