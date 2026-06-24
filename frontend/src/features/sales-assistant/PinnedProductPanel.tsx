import type { CatalogProduct } from "../product-catalog/productCatalogTypes";
import { getTryOnLabel } from "../product-catalog/productCatalogTypes";
import { formatVnd } from "../sales-nlp/answerGenerator";

type PinnedProductPanelProps = {
  product: CatalogProduct;
};

export function PinnedProductPanel({ product }: PinnedProductPanelProps) {
  const stockClass =
    product.stock <= 0 ? "outOfStock" : product.stock <= 5 ? "lowStock" : "inStock";
  const stockLabel =
    product.stock <= 0 ? "Hết hàng" : product.stock <= 5 ? "Sắp hết hàng" : "Còn hàng";

  return (
    <section className="pinnedProductPanel videoCard" aria-label="Pinned product">
      <div className="cardHeader">
        <h2>Sản phẩm đang ghim</h2>
        <span className="status">Live commerce</span>
      </div>
      <div className="pinnedProductBody">
        <div className="pinnedProductTopRow">
          <span className="pinnedProductBadge">Đang giới thiệu</span>
          <span className="pinnedProductTryOnBadge">{getTryOnLabel(product.arEffectType)}</span>
        </div>

        <h3>{product.name}</h3>
        <p className="pinnedProductPrice">{formatVnd(product.price)}</p>
        <p className="panelDescription">{product.description}</p>

        <div className="pinnedProductStatusRow">
          <span className={`pinnedProductStockBadge ${stockClass}`}>{stockLabel}</span>
          <span className="pinnedProductStockCount">Còn {product.stock} sp</span>
        </div>

        {product.colors.length > 0 ? (
          <div className="pinnedProductColors">
            <span className="pinnedProductColorsLabel">Màu có sẵn</span>
            <div className="pinnedProductColorChips">
              {product.colors.map((color) => (
                <span className="pinnedProductColorChip" key={color}>
                  {color}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {product.sizes.length > 0 ? (
          <div className="pinnedProductColors">
            <span className="pinnedProductColorsLabel">Size</span>
            <div className="pinnedProductColorChips">
              {product.sizes.map((size) => (
                <span className="pinnedProductColorChip" key={size}>
                  {size}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <a className="pinnedProductLinkButton" href={product.productUrl}>
          Xem sản phẩm · {product.productUrl}
        </a>
      </div>
    </section>
  );
}
