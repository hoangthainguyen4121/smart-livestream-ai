from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    email: str
    display_name: Optional[str] = None
    role: str
    created_at: datetime


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: Optional[str] = Field(default=None, max_length=120)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserResponse


class ShopWrite(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=1000)


class ShopResponse(ShopWrite):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    owner_user_id: UUID
    slug: str
    created_at: datetime
    updated_at: datetime


class ProductWrite(BaseModel):
    sku: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=160)
    description: Optional[str] = Field(default=None, max_length=2000)
    category: str = Field(default="fashion", min_length=1, max_length=64)
    price: Decimal = Field(ge=0)
    stock: int = Field(ge=0)
    image_url: Optional[str] = Field(default=None, max_length=1000)
    colors: list[str] = Field(default_factory=list)
    sizes: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    selling_points: list[str] = Field(default_factory=list)
    ar_effect_type: str = Field(default="none", min_length=1, max_length=64)
    source_url: Optional[str] = Field(default=None, max_length=1000)
    is_active: bool = True


class ProductUpdate(BaseModel):
    sku: Optional[str] = Field(default=None, min_length=1, max_length=64)
    name: Optional[str] = Field(default=None, min_length=1, max_length=160)
    description: Optional[str] = Field(default=None, max_length=2000)
    category: Optional[str] = Field(default=None, min_length=1, max_length=64)
    price: Optional[Decimal] = Field(default=None, ge=0)
    stock: Optional[int] = Field(default=None, ge=0)
    image_url: Optional[str] = Field(default=None, max_length=1000)
    colors: Optional[list[str]] = None
    sizes: Optional[list[str]] = None
    tags: Optional[list[str]] = None
    selling_points: Optional[list[str]] = None
    ar_effect_type: Optional[str] = Field(default=None, min_length=1, max_length=64)
    source_url: Optional[str] = Field(default=None, max_length=1000)
    is_active: Optional[bool] = None


class ProductResponse(ProductWrite):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    shop_id: UUID
    created_at: datetime
    updated_at: datetime


class RoomProductAttach(BaseModel):
    product_id: UUID
    position: int = Field(default=0, ge=0)


class RoomProductPin(BaseModel):
    product_id: Optional[UUID] = None


class RoomProductResponse(ProductResponse):
    position: int
    is_pinned: bool


class OrderItemRequest(BaseModel):
    product_id: UUID
    quantity: int = Field(ge=1, le=100)


class OrderCreate(BaseModel):
    items: list[OrderItemRequest] = Field(min_length=1, max_length=100)
    shipping_name: str = Field(min_length=1, max_length=120)
    shipping_address: str = Field(min_length=1, max_length=500)
    phone: Optional[str] = Field(default=None, max_length=32)
    room_id: Optional[str] = Field(default=None, max_length=64)


class OrderItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    product_id: UUID
    product_name: str
    quantity: int
    unit_price: Decimal
    line_total: Decimal


class OrderResponse(BaseModel):
    id: UUID
    buyer_user_id: UUID
    shop_id: UUID
    room_id: Optional[str] = None
    status: str
    total_amount: Decimal
    shipping_name: str
    shipping_address: str
    phone: Optional[str] = None
    created_at: datetime
    items: list[OrderItemResponse]


class PaymentCreate(BaseModel):
    order_id: UUID
    method: Literal["cod", "sandbox"]


class OrderPaymentCreate(BaseModel):
    method: Literal["cod", "sandbox"]


class SandboxResult(BaseModel):
    result: Literal["success", "failure"]


class PaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    order_id: UUID
    method: str
    status: str
    amount: Decimal
    transaction_ref: Optional[str] = None
    created_at: datetime
    updated_at: datetime
