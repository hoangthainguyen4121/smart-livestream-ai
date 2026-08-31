import { useCallback, useEffect, useMemo, useState } from "react";

import { createLiveRoom, listActiveLiveRooms, type LiveRoom } from "../api/liveSessions";
import { filterLiveRooms } from "../features/live-rooms/filterLiveRooms";
import { markRoomAsHosted } from "../features/live-rooms/hostedRooms";
import { saveHostResumeToken } from "../features/live-rooms/hostResumeToken";
import { DirectoryPreviewProvider } from "../features/live-rooms/DirectoryPreviewContext";
import { RoomCardPreview } from "../features/live-rooms/RoomCardPreview";
import {
  DEFAULT_ROOM_TYPE,
  getRoomTypeLabel,
  LIVE_ROOM_CATEGORIES,
  roomTypeRequiresCommerce,
  type LiveRoomType,
  type LiveRoomTypeFilter,
} from "../features/live-rooms/roomTypes";
import { useI18n } from "../i18n/I18nProvider";
import { liveRoomPath, navigateHash } from "../routing/hashRoute";
import {
  attachRoomProduct,
  createProduct,
  createShop,
  deleteProduct,
  getMyShop,
  listProducts,
  pinRoomProduct,
  updateProduct,
  type ProductInput,
  type Shop,
} from "../api/commerce";
import { AuthStatusPanel } from "../features/auth/AuthStatusPanel";
import { useOptionalAuth } from "../features/auth/useOptionalAuth";
import type { CatalogProduct } from "../features/product-catalog";
import { ProductCatalogPanel } from "../features/product-catalog/components/ProductCatalogPanel";
import {
  filterSellerProducts,
  toggleSelectedProduct,
} from "../features/product-catalog/sellerRoomSelection";

const POLL_MS = 12_000;

export function LiveRoomsPage() {
  const { t, locale } = useI18n();
  const [rooms, setRooms] = useState<LiveRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [roomType, setRoomType] = useState<LiveRoomTypeFilter>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createType, setCreateType] = useState<LiveRoomType>(DEFAULT_ROOM_TYPE);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const auth = useOptionalAuth();
  const [shop, setShop] = useState<Shop | null>(null);
  const [shopLoading, setShopLoading] = useState(false);
  const [shopName, setShopName] = useState("");
  const [shopError, setShopError] = useState<string | null>(null);
  const [sellerProducts, setSellerProducts] = useState<CatalogProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [productSelectionQuery, setProductSelectionQuery] = useState("");
  const [createBlockedVisible, setCreateBlockedVisible] = useState(false);

  useEffect(() => {
    if (!auth.user) {
      setShop(null);
      return;
    }
    setShopLoading(true);
    void getMyShop()
      .then(setShop)
      .catch((shopLoadError) => {
        setShopError(
          shopLoadError instanceof Error
            ? shopLoadError.message
            : "Không tải được thông tin cửa hàng.",
        );
      })
      .finally(() => setShopLoading(false));
  }, [auth.user]);

  useEffect(() => {
    if (!shop) {
      setSellerProducts([]);
      setSelectedProductIds(new Set());
      return;
    }
    let cancelled = false;
    setProductsLoading(true);
    setProductsError(null);
    void listProducts({ shopId: shop.id })
      .then((products) => {
        if (!cancelled) setSellerProducts(products);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setProductsError(
            loadError instanceof Error ? loadError.message : "Không thể tải sản phẩm của shop.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setProductsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [shop]);

  const loadRooms = useCallback(async () => {
    setError(null);
    try {
      const next = await listActiveLiveRooms();
      setRooms(next);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("roomsLoadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);

  useEffect(() => {
    let timer: number | undefined;

    const schedule = () => {
      window.clearInterval(timer);
      if (document.visibilityState === "hidden") {
        return;
      }
      timer = window.setInterval(() => {
        void loadRooms();
      }, POLL_MS);
    };

    schedule();
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadRooms();
      }
      schedule();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadRooms]);

  const filteredRooms = useMemo(
    () => filterLiveRooms(rooms, { query, roomType }),
    [rooms, query, roomType],
  );

  const createRequiresCommerce = roomTypeRequiresCommerce(createType);
  const sellerDataLoading = auth.loading;
  const createBlockedReason = !auth.loading && !auth.user
    ? "Bạn cần đăng nhập (hoặc đăng ký) trước khi tạo phòng livestream."
    : null;

  function openCreateRoom() {
    if (createBlockedReason) {
      setCreateBlockedVisible(true);
      return;
    }
    setCreateBlockedVisible(false);
    setCreateError(null);
    setCreateOpen(true);
  }

  async function handleCreateRoom() {
    const name = createName.trim();
    if (!name) {
      setCreateError(t("roomsCreateNameRequired"));
      return;
    }
    if (createRequiresCommerce && !shop) {
      setCreateError("Loại phòng bán hàng yêu cầu bạn tạo cửa hàng trước.");
      return;
    }
    if (createRequiresCommerce && selectedProductIds.size === 0) {
      setCreateError("Hãy chọn ít nhất một sản phẩm để gắn vào phòng.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      if (!auth.user) throw new Error("Hãy đăng nhập trước khi tạo phòng.");
      const room = await createLiveRoom({
        name,
        room_type: createType,
        product_ids: createRequiresCommerce ? [...selectedProductIds] : [],
      });
      if (room.host_resume_token) {
        saveHostResumeToken(room.room_id, room.host_resume_token, room.id);
      }
      if (createRequiresCommerce) {
        for (const productId of selectedProductIds) {
          await attachRoomProduct(room.room_id, productId);
        }
        const firstProductId = selectedProductIds.values().next().value as string | undefined;
        if (firstProductId) await pinRoomProduct(room.room_id, firstProductId);
      }
      markRoomAsHosted(room.room_id);
      setCreateOpen(false);
      setCreateName("");
      setSelectedProductIds(new Set());
      navigateHash(liveRoomPath(room.room_id));
    } catch (createErr) {
      setCreateError(createErr instanceof Error ? createErr.message : t("roomsCreateError"));
    } finally {
      setCreating(false);
    }
  }

  async function handleCreateProduct(input: ProductInput): Promise<CatalogProduct> {
    if (!shop) throw new Error("Hãy tạo shop trước.");
    const product = await createProduct(shop.id, input);
    setSellerProducts((current) => [product, ...current]);
    return product;
  }

  async function handleUpdateProduct(
    product: CatalogProduct,
    input: ProductInput,
  ): Promise<CatalogProduct> {
    const updated = await updateProduct(product.id, input);
    setSellerProducts((current) =>
      current.map((entry) => (entry.id === updated.id ? updated : entry)),
    );
    return updated;
  }

  async function handleDeactivateProduct(product: CatalogProduct): Promise<void> {
    if (!window.confirm(`Ngừng bán “${product.name}”? Sản phẩm sẽ không còn xuất hiện trong shop.`)) {
      return;
    }
    await deleteProduct(product.id);
    setSellerProducts((current) => current.filter((entry) => entry.id !== product.id));
    setSelectedProductIds((current) => {
      const next = new Set(current);
      next.delete(product.id);
      return next;
    });
  }

  return (
    <main className="page liveRoomsPage">
      <header className="liveRoomsHeader">
        <div>
          <p className="eyebrow">{t("appEyebrow")}</p>
          <h1>{t("roomsTitle")}</h1>
          <p className="liveRoomsSubtitle">{t("roomsSubtitle")}</p>
          <p className="liveRoomsCount">
            {t("roomsActiveCount", { count: loading ? "…" : rooms.length })}
          </p>
        </div>
        <div className="liveRoomsHeaderActions">
          <button type="button" className="liveRoomsRefreshButton" onClick={() => void loadRooms()}>
            {t("roomsRefresh")}
          </button>
          <button
            type="button"
            className="liveRoomsCreateButton"
            aria-describedby={createBlockedVisible ? "create-room-blocked" : undefined}
            disabled={sellerDataLoading}
            title={createBlockedReason ?? undefined}
            onClick={openCreateRoom}
          >
            {t("roomsCreate")}
          </button>
        </div>
      </header>

      {createBlockedVisible && createBlockedReason ? (
        <p className="liveRoomsBlockedNotice" id="create-room-blocked" role="alert">
          {createBlockedReason}
        </p>
      ) : null}

      <AuthStatusPanel
        configured={auth.configured}
        loading={auth.loading}
        user={auth.user}
        error={auth.error}
        onLogin={auth.login}
        onRegister={auth.register}
        onGoogleLogin={auth.googleConfigured ? auth.loginWithGoogle : undefined}
        onLogout={() => void auth.logout()}
      />
      {auth.user && shop ? (
        <section className="sellerIdentityCard" aria-label="Thông tin shop hiện tại">
          <div>
            <span className="sellerIdentityLabel">Đang đăng nhập</span>
            <strong>{auth.user.displayName}</strong>
            <small>{auth.user.email}</small>
          </div>
          <div>
            <span className="sellerIdentityLabel">Shop đang quản lý</span>
            <strong>{shop.name}</strong>
            <small>{sellerProducts.length} sản phẩm đang bán</small>
          </div>
          <div className="sellerFlowHint">
            <span>1. Sản phẩm</span>
            <span>2. Tạo phòng</span>
            <span>3. Livestream</span>
          </div>
        </section>
      ) : null}
      {auth.user && !shop && !shopLoading ? (
        <section className="videoCard shopSetupPanel">
          <h2>Thiết lập cửa hàng</h2>
          <p className="panelDescription">
            Tạo shop một lần để quản lý sản phẩm và mở phòng livestream của riêng bạn.
          </p>
          <div className="shopSetupRow">
            <input value={shopName} onChange={(event) => setShopName(event.target.value)} placeholder="Tên cửa hàng" />
            <button
              type="button"
              className="authButton shopSetupSubmit"
              disabled={!shopName.trim()}
              onClick={() => {
                setShopError(null);
                void createShop({ name: shopName.trim() })
                  .then((created) => {
                    setShop(created);
                    setShopName("");
                  })
                  .catch((error) => {
                    setShopError(
                      error instanceof Error ? error.message : "Không thể tạo cửa hàng.",
                    );
                  });
              }}
            >
              Tạo cửa hàng
            </button>
          </div>
          {shopError ? <p className="error">{shopError}</p> : null}
        </section>
      ) : null}

      {auth.user && shop ? (
        <section className="sellerWorkspace">
          <div className="sellerWorkspaceHeader">
            <div>
              <p className="eyebrow">Bước 1 · Chuẩn bị catalog</p>
              <h2>Sản phẩm của {shop.name}</h2>
              <p className="panelDescription">
                Chỉ sản phẩm của shop này được hiển thị và có thể gắn vào phòng.
              </p>
            </div>
            <button
              type="button"
              className="liveRoomsCreateButton"
              disabled={sellerDataLoading}
              onClick={openCreateRoom}
            >
              Tiếp tục tạo phòng
            </button>
          </div>
          {productsLoading ? <p className="emptyState">Đang tải sản phẩm của shop…</p> : null}
          {productsError ? (
            <p className="error" role="alert">
              {productsError}
            </p>
          ) : null}
          {!productsLoading ? (
            <ProductCatalogPanel
              titleOverride="Quản lý sản phẩm"
              products={sellerProducts}
              onCreateProduct={handleCreateProduct}
              onUpdateProduct={handleUpdateProduct}
              onDeleteProduct={(product) => void handleDeactivateProduct(product)}
              onProductCreated={(product) => {
                setSelectedProductIds((current) => new Set(current).add(product.id));
              }}
              emptyMessage="Shop chưa có sản phẩm. Hãy chọn “Đăng sản phẩm” để tạo sản phẩm đầu tiên."
            />
          ) : null}
        </section>
      ) : null}

      <section className="liveRoomsFilters" aria-label={t("roomsFiltersLabel")}>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("roomsSearchPlaceholder")}
          className="liveRoomsSearch"
        />
        <select
          value={roomType}
          onChange={(event) => setRoomType(event.target.value as LiveRoomTypeFilter)}
          className="liveRoomsTypeSelect"
          aria-label={t("roomsTypeFilter")}
        >
          <option value="all">{t("roomTypeAll")}</option>
          {LIVE_ROOM_CATEGORIES.map((category) => (
            <option key={category.id} value={category.id}>
              {getRoomTypeLabel(category.id, locale)}
            </option>
          ))}
        </select>
      </section>

      {loading ? (
        <div className="liveRoomsGrid" aria-busy="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="liveRoomCard liveRoomCardSkeleton" />
          ))}
        </div>
      ) : null}

      {!loading && error ? (
        <div className="liveRoomsState error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void loadRooms()}>
            {t("roomsRetry")}
          </button>
        </div>
      ) : null}

      {!loading && !error && rooms.length === 0 ? (
        <div className="liveRoomsState">
          <p>{t("roomsEmpty")}</p>
          <button
            type="button"
            className="liveRoomsCreateButton"
            disabled={sellerDataLoading}
            title={createBlockedReason ?? undefined}
            onClick={openCreateRoom}
          >
            {!auth.user
              ? "Đăng nhập để tạo phòng"
              : t("roomsCreateFirst")}
          </button>
        </div>
      ) : null}

      {!loading && !error && rooms.length > 0 && filteredRooms.length === 0 ? (
        <div className="liveRoomsState">
          <p>{t("roomsFilteredEmpty")}</p>
        </div>
      ) : null}

      {!loading && !error && filteredRooms.length > 0 ? (
        <DirectoryPreviewProvider rooms={filteredRooms}>
          <div className="liveRoomsGrid">
            {filteredRooms.map((room) => (
              <article key={room.id} className="liveRoomCard">
                <RoomCardPreview room={room} />
                <div className="liveRoomCardBody">
                  <h2>{room.name}</h2>
                  <div className="liveRoomCardMeta">
                    <span className="liveRoomTypeChip">
                      {getRoomTypeLabel(room.room_type, locale)}
                    </span>
                  </div>
                  <p className="liveRoomCardTime">
                    {t("roomsStartedAt", {
                      time: new Date(room.started_at).toLocaleString(locale === "vi" ? "vi-VN" : "en-US"),
                    })}
                  </p>
                  <button
                    type="button"
                    className="liveRoomJoinButton"
                    onClick={() => navigateHash(liveRoomPath(room.room_id))}
                  >
                    {t("roomsJoin")}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </DirectoryPreviewProvider>
      ) : null}

      {createOpen ? (
        <div
          className="liveRoomsModalBackdrop"
          role="presentation"
          onClick={() => {
            if (!creating) {
              setCreateOpen(false);
            }
          }}
        >
          <div
            className="liveRoomsModal liveRoomsCreateModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-room-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="create-room-title">{t("roomsCreateTitle")}</h2>
            <p
              className={`createRoomOwnership ${
                createRequiresCommerce ? "isCommerceRoom" : "isSocialRoom"
              }`}
            >
              {createRequiresCommerce ? (
                shop ? (
                  <>Phòng bán hàng thuộc shop <strong>{shop.name}</strong>. Hãy chọn sản phẩm bên dưới.</>
                ) : (
                  <>Loại phòng bán hàng yêu cầu cửa hàng và ít nhất một sản phẩm.</>
                )
              ) : (
                <>Phòng giao lưu không yêu cầu cửa hàng hoặc sản phẩm.</>
              )}
            </p>
            <label className="liveRoomsModalField">
              <span>{t("roomsCreateName")}</span>
              <input
                value={createName}
                maxLength={80}
                onChange={(event) => setCreateName(event.target.value)}
                placeholder={t("roomsCreateNamePlaceholder")}
                autoFocus
              />
            </label>
            <label className="liveRoomsModalField">
              <span>{t("roomsCreateType")}</span>
              <select
                value={createType}
                onChange={(event) => {
                  setCreateType(event.target.value as LiveRoomType);
                  setCreateError(null);
                }}
              >
                {LIVE_ROOM_CATEGORIES.map((category) => (
                  <option key={category.id} value={category.id}>
                    {getRoomTypeLabel(category.id, locale)}
                    {category.commerce_required ? " (*)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <p className="liveRoomsCommerceFootnote">
              Loại phòng có gắn <span className="commerceFootnoteMark">(*)</span> thì cần{" "}
              <strong>Tạo shop</strong> và có ít nhất 1 <strong>Sản phẩm</strong>.
            </p>
            {createRequiresCommerce && shop ? (
              <fieldset className="roomProductSelector">
                <legend>Sản phẩm trong phòng ({selectedProductIds.size} đã chọn)</legend>
                <input
                  type="search"
                  value={productSelectionQuery}
                  onChange={(event) => setProductSelectionQuery(event.target.value)}
                  placeholder="Tìm sản phẩm để gắn vào phòng…"
                />
                <div className="roomProductSelectorList">
                  {filterSellerProducts(sellerProducts, productSelectionQuery)
                    .map((product) => (
                      <label key={product.id}>
                        <input
                          type="checkbox"
                          checked={selectedProductIds.has(product.id)}
                          disabled={product.stock <= 0}
                          onChange={() => {
                            setSelectedProductIds((current) => {
                              return toggleSelectedProduct(current, product.id);
                            });
                          }}
                        />
                        <span>
                          <strong>{product.name}</strong>
                          <small>
                            {product.price.toLocaleString("vi-VN")}đ · còn {product.stock}
                          </small>
                        </span>
                      </label>
                    ))}
                  {productsLoading ? (
                    <p className="emptyState">Đang tải sản phẩm…</p>
                  ) : filterSellerProducts(sellerProducts, productSelectionQuery).length === 0 ? (
                    <p className="emptyState">Shop chưa có sản phẩm phù hợp.</p>
                  ) : null}
                </div>
              </fieldset>
            ) : null}
            {createError ? <div className="error">{createError}</div> : null}
            <div className="liveRoomsModalActions">
              <button
                type="button"
                className="liveRoomsCancelButton"
                disabled={creating}
                onClick={() => setCreateOpen(false)}
              >
                {t("roomsCreateCancel")}
              </button>
              <button
                type="button"
                className="liveRoomsCreateButton"
                disabled={
                  creating ||
                  !auth.user ||
                  (createRequiresCommerce &&
                    (!shop || productsLoading || selectedProductIds.size === 0))
                }
                onClick={() => void handleCreateRoom()}
              >
                {creating ? t("roomsCreating") : t("roomsCreateSubmit")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
