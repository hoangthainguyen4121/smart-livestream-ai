from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, Union
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.exc import IntegrityError

from app.db.engine import get_session_factory
from app.db.models import Product, RoomProduct, Shop, User
from app.repositories.commerce_repository import CommerceRepository
from app.schemas.commerce import (
    OrderCreate,
    OrderPaymentCreate,
    OrderResponse,
    PaymentCreate,
    PaymentResponse,
    ProductResponse,
    ProductUpdate,
    ProductWrite,
    RoomProductAttach,
    RoomProductPin,
    RoomProductResponse,
    SandboxResult,
    ShopResponse,
    ShopWrite,
)
from app.services.auth_service import get_current_user
from app.services.commerce_service import (
    CommerceError,
    apply_sandbox_result,
    attach_room_product,
    create_order,
    create_payment,
    create_product,
    generate_shop_slug,
    order_response,
    owned_shop,
)
from app.services.product_image_service import (
    MAX_PRODUCT_IMAGE_BYTES,
    ProductImageError,
    save_product_image,
)

router = APIRouter(tags=["commerce"])


def fail(error: CommerceError) -> HTTPException:
    return HTTPException(error.status_code, detail={"code": error.code, "message": error.message})


@router.post("/shops", response_model=ShopResponse, status_code=status.HTTP_201_CREATED)
def create_shop(data: ShopWrite, user: User = Depends(get_current_user)) -> Shop:
    with get_session_factory() as session:
        shop = Shop(
            owner_user_id=user.id,
            name=data.name.strip(),
            slug=generate_shop_slug(data.name),
            description=data.description,
        )
        session.add(shop)
        try:
            session.commit()
        except IntegrityError as error:
            session.rollback()
            raise HTTPException(409, detail="User already owns a shop.") from error
        session.refresh(shop)
        return shop


@router.get("/shops/me", response_model=ShopResponse)
def get_my_shop(user: User = Depends(get_current_user)) -> Shop:
    with get_session_factory() as session:
        try:
            return owned_shop(CommerceRepository(session), user)
        except CommerceError as error:
            raise fail(error) from error


@router.patch("/shops/me", response_model=ShopResponse)
def update_my_shop(data: ShopWrite, user: User = Depends(get_current_user)) -> Shop:
    with get_session_factory() as session:
        try:
            shop = owned_shop(CommerceRepository(session), user)
        except CommerceError as error:
            raise fail(error) from error
        shop.name = data.name.strip()
        shop.description = data.description
        shop.updated_at = datetime.now(timezone.utc)
        session.add(shop)
        session.commit()
        session.refresh(shop)
        return shop


@router.get("/shops/{shop_id}", response_model=ShopResponse)
def get_shop(shop_id: UUID) -> Shop:
    with get_session_factory() as session:
        shop = session.get(Shop, shop_id)
        if shop is None:
            raise HTTPException(404, detail="Shop was not found.")
        return shop


@router.get("/products", response_model=list[Union[RoomProductResponse, ProductResponse]])
def list_products(
    shop_id: Optional[UUID] = Query(default=None),
    room_id: Optional[str] = Query(default=None),
) -> list[Union[RoomProductResponse, Product]]:
    with get_session_factory() as session:
        if room_id is not None:
            return [
                RoomProductResponse(
                    **ProductResponse.model_validate(product).model_dump(),
                    position=row.position,
                    is_pinned=row.is_pinned,
                )
                for row, product in CommerceRepository(session).room_products(room_id)
            ]
        return CommerceRepository(session).products(shop_id)


@router.get("/shops/{shop_id}/products", response_model=list[ProductResponse])
def list_shop_products(shop_id: UUID) -> list[Product]:
    with get_session_factory() as session:
        return CommerceRepository(session).products(shop_id)


@router.post("/products/images", status_code=status.HTTP_201_CREATED)
async def upload_product_image(
    image: UploadFile = File(...),
    user: User = Depends(get_current_user),
) -> dict[str, str]:
    with get_session_factory() as session:
        try:
            owned_shop(CommerceRepository(session), user)
        except CommerceError as error:
            raise fail(error) from error

    content = await image.read(MAX_PRODUCT_IMAGE_BYTES + 1)
    try:
        image_url = save_product_image(content, image.content_type)
    except ProductImageError as error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)) from error
    finally:
        await image.close()
    return {"image_url": image_url}


@router.get("/products/{product_id}", response_model=ProductResponse)
def get_product(product_id: UUID) -> Product:
    with get_session_factory() as session:
        product = CommerceRepository(session).product(product_id)
        if product is None:
            raise HTTPException(404, detail="Product was not found.")
        return product


@router.post("/products", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
def api_create_product(data: ProductWrite, user: User = Depends(get_current_user)) -> Product:
    with get_session_factory() as session:
        try:
            return create_product(session, user, data)
        except CommerceError as error:
            raise fail(error) from error


@router.post(
    "/shops/{shop_id}/products",
    response_model=ProductResponse,
    status_code=status.HTTP_201_CREATED,
)
def api_create_shop_product(
    shop_id: UUID,
    data: ProductWrite,
    user: User = Depends(get_current_user),
) -> Product:
    with get_session_factory() as session:
        try:
            return create_product(session, user, data, shop_id=shop_id)
        except CommerceError as error:
            raise fail(error) from error


def owner_product(session, user: User, product_id: UUID) -> Product:
    product = CommerceRepository(session).product(product_id, include_inactive=True)
    if product is None:
        raise CommerceError("product_not_found", "Product was not found.", 404)
    shop = session.get(Shop, product.shop_id)
    if shop is None or shop.owner_user_id != user.id:
        raise CommerceError("product_forbidden", "Product belongs to another shop.", 403)
    return product


@router.patch("/products/{product_id}", response_model=ProductResponse)
def update_product(
    product_id: UUID, data: ProductUpdate, user: User = Depends(get_current_user)
) -> Product:
    with get_session_factory() as session:
        try:
            product = owner_product(session, user, product_id)
            for key, value in data.model_dump(exclude_unset=True).items():
                setattr(product, key, value)
            product.updated_at = datetime.now(timezone.utc)
            session.add(product)
            session.commit()
            session.refresh(product)
            return product
        except CommerceError as error:
            raise fail(error) from error
        except IntegrityError as error:
            session.rollback()
            raise HTTPException(409, detail="SKU already exists in this shop.") from error


@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(product_id: UUID, user: User = Depends(get_current_user)) -> None:
    with get_session_factory() as session:
        try:
            product = owner_product(session, user, product_id)
        except CommerceError as error:
            raise fail(error) from error
        product.is_active = False
        product.updated_at = datetime.now(timezone.utc)
        session.add(product)
        session.commit()


@router.post("/rooms/{room_id}/products", response_model=RoomProductResponse)
def attach_product(
    room_id: str, data: RoomProductAttach, user: User = Depends(get_current_user)
) -> RoomProductResponse:
    with get_session_factory() as session:
        try:
            row = attach_room_product(session, user, room_id, data.product_id, data.position)
            product = session.get(Product, row.product_id)
            return RoomProductResponse(
                **ProductResponse.model_validate(product).model_dump(),
                position=row.position,
                is_pinned=row.is_pinned,
            )
        except CommerceError as error:
            raise fail(error) from error


@router.get("/rooms/{room_id}/products", response_model=list[RoomProductResponse])
def list_room_products(room_id: str) -> list[RoomProductResponse]:
    with get_session_factory() as session:
        return [
            RoomProductResponse(
                **ProductResponse.model_validate(product).model_dump(),
                position=row.position,
                is_pinned=row.is_pinned,
            )
            for row, product in CommerceRepository(session).room_products(room_id)
        ]


@router.post("/rooms/{room_id}/products/pin", response_model=Optional[RoomProductResponse])
def pin_room_product(
    room_id: str, data: RoomProductPin, user: User = Depends(get_current_user)
) -> Optional[RoomProductResponse]:
    with get_session_factory() as session:
        try:
            repo = CommerceRepository(session)
            shop = owned_shop(repo, user)
            if repo.room_shop_id(room_id) != shop.id:
                raise CommerceError("room_forbidden", "This room is not owned by your shop.", 403)
            row = (
                session.get(RoomProduct, (room_id, data.product_id))
                if data.product_id is not None
                else None
            )
            if data.product_id is not None and row is None:
                raise CommerceError("room_product_not_found", "Product is not attached.", 404)
            for existing, _ in repo.room_products(room_id):
                existing.is_pinned = existing.product_id == data.product_id
                session.add(existing)
            session.commit()
            if row is None:
                return None
            session.refresh(row)
            product = session.get(Product, row.product_id)
            return RoomProductResponse(
                **ProductResponse.model_validate(product).model_dump(),
                position=row.position,
                is_pinned=row.is_pinned,
            )
        except CommerceError as error:
            raise fail(error) from error


@router.post("/orders", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
def api_create_order(data: OrderCreate, user: User = Depends(get_current_user)) -> OrderResponse:
    with get_session_factory() as session:
        try:
            return create_order(session, user, data)
        except CommerceError as error:
            session.rollback()
            raise fail(error) from error


@router.get("/orders/{order_id}", response_model=OrderResponse)
def get_order(order_id: UUID, user: User = Depends(get_current_user)) -> OrderResponse:
    with get_session_factory() as session:
        order, items = CommerceRepository(session).order_with_items(order_id)
        if order is None:
            raise HTTPException(404, detail="Order was not found.")
        if order.buyer_user_id != user.id:
            raise HTTPException(403, detail="This order belongs to another user.")
        return order_response(order, items)


@router.post("/payments", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
def api_create_payment(data: PaymentCreate, user: User = Depends(get_current_user)):
    with get_session_factory() as session:
        try:
            return create_payment(session, user, data.order_id, data.method)
        except CommerceError as error:
            raise fail(error) from error


@router.post(
    "/orders/{order_id}/payments",
    response_model=PaymentResponse,
    status_code=status.HTTP_201_CREATED,
)
def api_create_order_payment(
    order_id: UUID,
    data: OrderPaymentCreate,
    user: User = Depends(get_current_user),
):
    with get_session_factory() as session:
        try:
            return create_payment(session, user, order_id, data.method)
        except CommerceError as error:
            raise fail(error) from error


@router.post("/payments/{payment_id}/sandbox-result", response_model=PaymentResponse)
def sandbox_result(
    payment_id: UUID, data: SandboxResult, user: User = Depends(get_current_user)
):
    with get_session_factory() as session:
        try:
            return apply_sandbox_result(session, user, payment_id, data.result)
        except CommerceError as error:
            raise fail(error) from error
