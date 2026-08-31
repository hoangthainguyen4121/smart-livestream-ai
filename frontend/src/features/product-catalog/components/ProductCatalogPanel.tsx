import { useEffect, useMemo, useState } from "react";

import { useI18n } from "../../../i18n/I18nProvider";
import { formatVnd } from "../../sales-nlp/answerGenerator";
import type { ProductInput } from "../../../api/commerce";
import { ProductCreateForm } from "./ProductCreateForm";
import { paginateProducts } from "../sellerRoomSelection";
import {
  PRODUCT_CATEGORY_LABELS,
  getTryOnLabel,
  type CatalogProduct,
  type ProductCategory,
} from "../productCatalogTypes";

type ProductCatalogPanelProps = {
  pinnedProductId?: string;
  onPinProduct?: (productId: string) => void;
  onAddToCart?: (productId: string) => void;
  onProductCreated?: (product: CatalogProduct) => void;
  catalogRevision?: number;
  products: CatalogProduct[];
  onCreateProduct?: (input: ProductInput) => Promise<CatalogProduct>;
  onUpdateProduct?: (product: CatalogProduct, input: ProductInput) => Promise<CatalogProduct>;
  onEditProduct?: (product: CatalogProduct) => void;
  onDeleteProduct?: (product: CatalogProduct) => void;
  attachedProductIds?: ReadonlySet<string>;
  onAttachProduct?: (productId: string) => void;
  titleOverride?: string;
  emptyMessage?: string;
  variant?: "host" | "store";
  compact?: boolean;
};

const CATEGORY_OPTIONS: Array<ProductCategory | "all"> = [
  "all",
  "glasses",
  "lipstick",
  "accessory",
  "skincare",
  "electronics",
  "fashion",
];

export function ProductCatalogPanel({
  pinnedProductId,
  onPinProduct,
  onAddToCart,
  onProductCreated,
  catalogRevision = 0,
  products: sourceProducts,
  onCreateProduct,
  onUpdateProduct,
  onEditProduct,
  onDeleteProduct,
  attachedProductIds,
  onAttachProduct,
  titleOverride,
  emptyMessage,
  variant = "host",
  compact = false,
}: ProductCatalogPanelProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ProductCategory | "all">("all");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<CatalogProduct | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = compact ? 8 : 12;

  const products = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return sourceProducts
      .filter((product) => {
        if (category !== "all" && product.category !== category) return false;
        if (!normalized) return true;
        return [product.name, product.description, ...product.tags]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      })
      .sort((left, right) => {
        if (left.id === pinnedProductId) return -1;
        if (right.id === pinnedProductId) return 1;
        const leftAttached = attachedProductIds?.has(left.id) ? 1 : 0;
        const rightAttached = attachedProductIds?.has(right.id) ? 1 : 0;
        return rightAttached - leftAttached;
      });
  }, [
    sourceProducts,
    query,
    category,
    catalogRevision,
    pinnedProductId,
    attachedProductIds,
  ]);

  const title =
    titleOverride ??
    (variant === "store"
      ? t("customerStore")
      : compact
        ? t("pinProduct")
        : t("productCatalog"));
  const pageCount = Math.max(1, Math.ceil(products.length / pageSize));
  const visibleProducts = paginateProducts(products, page, pageSize);

  useEffect(() => {
    setPage(1);
  }, [query, category, sourceProducts.length]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  return (
    <section className={`productCatalogPanel videoCard ${compact ? "compact" : ""}`}>
      <div className="cardHeader">
        <h2>{title}</h2>
        <div className="productCatalogHeaderActions">
          <span className="status">{t("items", { count: products.length })}</span>
          {variant === "host" ? (
            <button
              type="button"
              className="productCreateToggle"
              onClick={() => {
                setEditingProduct(null);
                setShowCreateForm((visible) => !visible);
              }}
            >
              {showCreateForm ? t("cancel") : t("productCreate")}
            </button>
          ) : null}
        </div>
      </div>

      {variant === "host" && (showCreateForm || editingProduct) && onCreateProduct ? (
        <ProductCreateForm
          key={editingProduct?.id ?? "create"}
          initialProduct={editingProduct}
          onCreate={(input) =>
            editingProduct && onUpdateProduct
              ? onUpdateProduct(editingProduct, input)
              : onCreateProduct(input)
          }
          onCancel={() => {
            setShowCreateForm(false);
            setEditingProduct(null);
          }}
          onCreated={(product) => {
            const wasEditing = Boolean(editingProduct);
            setShowCreateForm(false);
            setEditingProduct(null);
            if (!wasEditing) onProductCreated?.(product);
          }}
        />
      ) : null}

      <div className="productCatalogFilters">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
        />
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value as ProductCategory | "all")}
        >
          {CATEGORY_OPTIONS.map((entry) => (
            <option key={entry} value={entry}>
              {entry === "all" ? t("allCategories") : PRODUCT_CATEGORY_LABELS[entry]}
            </option>
          ))}
        </select>
      </div>

      <div className="productCatalogGrid">
        {visibleProducts.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            isPinned={variant === "host" && product.id === pinnedProductId}
            variant={variant}
            onPin={onPinProduct ? () => onPinProduct(product.id) : undefined}
            isAttached={attachedProductIds?.has(product.id)}
            onAttach={onAttachProduct ? () => onAttachProduct(product.id) : undefined}
            onAddToCart={onAddToCart ? () => onAddToCart(product.id) : undefined}
            onEdit={
              onUpdateProduct
                ? () => {
                    setShowCreateForm(false);
                    setEditingProduct(product);
                  }
                : onEditProduct
                  ? () => onEditProduct(product)
                  : undefined
            }
            onDelete={onDeleteProduct ? () => onDeleteProduct(product) : undefined}
          />
        ))}
      </div>
      {products.length === 0 ? (
        <p className="emptyState">
          {emptyMessage ?? "Chưa có sản phẩm phù hợp. Hãy thêm sản phẩm mới hoặc đổi bộ lọc."}
        </p>
      ) : null}
      {pageCount > 1 ? (
        <nav className="productPagination" aria-label="Phân trang sản phẩm">
          <button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>
            Trang trước
          </button>
          <span>
            Trang {page}/{pageCount}
          </span>
          <button
            type="button"
            disabled={page === pageCount}
            onClick={() => setPage((value) => value + 1)}
          >
            Trang sau
          </button>
        </nav>
      ) : null}
    </section>
  );
}

function ProductCard({
  product,
  isPinned,
  variant,
  onPin,
  isAttached,
  onAttach,
  onAddToCart,
  onEdit,
  onDelete,
}: {
  product: CatalogProduct;
  isPinned: boolean;
  variant: "host" | "store";
  onPin?: () => void;
  isAttached?: boolean;
  onAttach?: () => void;
  onAddToCart?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const { t } = useI18n();
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <article className={`productCard ${isPinned ? "pinned" : ""}`}>
      <div className="productCardImage" aria-hidden="true">
        {product.imageUrl && !imageFailed ? (
          <img
            src={product.imageUrl}
            alt=""
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          product.name.slice(0, 1)
        )}
      </div>
      <div className="productCardBody">
        <div className="productCardTop">
          <h3>{product.name}</h3>
          <span className="productCardCategory">
            {PRODUCT_CATEGORY_LABELS[product.category]}
          </span>
        </div>
        <p className="productCardPrice">{formatVnd(product.price)}</p>
        <p className="productCardDescription">{product.description}</p>
        <div className="productCardMeta">
          <span>{t("inStock", { count: product.stock })}</span>
          <span>{getTryOnLabel(product.arEffectType)}</span>
        </div>
        {variant === "store" ? (
          <button type="button" onClick={onAddToCart} disabled={product.stock <= 0}>
            {product.stock <= 0 ? "Hết hàng" : t("addToCart")}
          </button>
        ) : (
          <div className="productCardActions">
            {onAttach ? (
              <button
                type="button"
                className={isAttached ? "active" : ""}
                onClick={onAttach}
                disabled={isAttached}
              >
                {isAttached ? "Đã gắn vào phòng" : "Gắn vào phòng"}
              </button>
            ) : null}
            {onPin ? (
              <button
                type="button"
                className={isPinned ? "active" : ""}
                onClick={onPin}
                disabled={attachedProductIdsRequired(isAttached)}
                title={attachedProductIdsRequired(isAttached) ? "Gắn sản phẩm vào phòng trước khi ghim" : undefined}
              >
                {isPinned ? t("pinned") : t("pinProductAction")}
              </button>
            ) : null}
            {onEdit ? <button type="button" className="secondary" onClick={onEdit}>Sửa</button> : null}
            {onDelete ? <button type="button" className="secondary" onClick={onDelete}>Ngừng bán</button> : null}
          </div>
        )}
      </div>
    </article>
  );
}

function attachedProductIdsRequired(isAttached: boolean | undefined): boolean {
  return isAttached === false;
}
