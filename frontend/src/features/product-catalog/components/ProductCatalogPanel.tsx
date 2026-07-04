import { useMemo, useState } from "react";

import { useI18n } from "../../../i18n/I18nProvider";
import { formatVnd } from "../../sales-nlp/answerGenerator";
import { searchAndFilterProducts } from "../productCatalogService";
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
  variant = "host",
  compact = false,
}: ProductCatalogPanelProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ProductCategory | "all">("all");

  const products = useMemo(
    () => searchAndFilterProducts({ query, category }),
    [query, category],
  );

  const title =
    variant === "store"
      ? t("customerStore")
      : compact
        ? t("pinProduct")
        : t("productCatalog");

  return (
    <section className={`productCatalogPanel videoCard ${compact ? "compact" : ""}`}>
      <div className="cardHeader">
        <h2>{title}</h2>
        <span className="status">{t("items", { count: products.length })}</span>
      </div>

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
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            isPinned={variant === "host" && product.id === pinnedProductId}
            variant={variant}
            onPin={onPinProduct ? () => onPinProduct(product.id) : undefined}
            onAddToCart={onAddToCart ? () => onAddToCart(product.id) : undefined}
          />
        ))}
      </div>
    </section>
  );
}

function ProductCard({
  product,
  isPinned,
  variant,
  onPin,
  onAddToCart,
}: {
  product: CatalogProduct;
  isPinned: boolean;
  variant: "host" | "store";
  onPin?: () => void;
  onAddToCart?: () => void;
}) {
  const { t } = useI18n();

  return (
    <article className={`productCard ${isPinned ? "pinned" : ""}`}>
      <div className="productCardImage" aria-hidden="true">
        {product.name.slice(0, 1)}
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
          <button type="button" onClick={onAddToCart}>
            {t("addToCart")}
          </button>
        ) : (
          <button type="button" className={isPinned ? "active" : ""} onClick={onPin}>
            {isPinned ? t("pinned") : t("pinProductAction")}
          </button>
        )}
      </div>
    </article>
  );
}
