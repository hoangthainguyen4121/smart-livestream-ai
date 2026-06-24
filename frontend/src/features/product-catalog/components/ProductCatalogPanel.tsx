import { useMemo, useState } from "react";

import { formatVnd } from "../../sales-nlp/answerGenerator";
import { searchAndFilterProducts } from "../productCatalogService";
import {
  PRODUCT_CATEGORY_LABELS,
  getTryOnLabel,
  type CatalogProduct,
  type ProductCategory,
} from "../productCatalogTypes";

type ProductCatalogPanelProps = {
  pinnedProductId: string;
  onPinProduct: (productId: string) => void;
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
  compact = false,
}: ProductCatalogPanelProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ProductCategory | "all">("all");

  const products = useMemo(
    () => searchAndFilterProducts({ query, category }),
    [query, category],
  );

  return (
    <section className={`productCatalogPanel videoCard ${compact ? "compact" : ""}`}>
      <div className="cardHeader">
        <h2>{compact ? "Pin Product" : "Product Catalog"}</h2>
        <span className="status">{products.length} items</span>
      </div>

      <div className="productCatalogFilters">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, tag, color..."
        />
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value as ProductCategory | "all")}
        >
          {CATEGORY_OPTIONS.map((entry) => (
            <option key={entry} value={entry}>
              {entry === "all" ? "All categories" : PRODUCT_CATEGORY_LABELS[entry]}
            </option>
          ))}
        </select>
      </div>

      <div className="productCatalogGrid">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            isPinned={product.id === pinnedProductId}
            onPin={() => onPinProduct(product.id)}
          />
        ))}
      </div>
    </section>
  );
}

function ProductCard({
  product,
  isPinned,
  onPin,
}: {
  product: CatalogProduct;
  isPinned: boolean;
  onPin: () => void;
}) {
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
          <span>Còn {product.stock}</span>
          <span>{getTryOnLabel(product.arEffectType)}</span>
        </div>
        <button type="button" className={isPinned ? "active" : ""} onClick={onPin}>
          {isPinned ? "Pinned" : "Pin product"}
        </button>
      </div>
    </article>
  );
}
