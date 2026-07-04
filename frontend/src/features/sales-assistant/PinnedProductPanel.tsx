import type { CatalogProduct } from "../product-catalog/productCatalogTypes";
import { getTryOnLabel } from "../product-catalog/productCatalogTypes";
import { useI18n } from "../../i18n/I18nProvider";
import { formatVnd } from "../sales-nlp/answerGenerator";

type PinnedProductPanelProps = {
  product: CatalogProduct;
};

export function PinnedProductPanel({ product }: PinnedProductPanelProps) {
  const { t } = useI18n();
  const stockClass =
    product.stock <= 0 ? "outOfStock" : product.stock <= 5 ? "lowStock" : "inStock";
  const stockLabel =
    product.stock <= 0 ? "Hết hàng" : product.stock <= 5 ? "Sắp hết hàng" : "Còn hàng";

  return (
    <section className="pinnedProductPanel videoCard" aria-label={t("pinnedProductTitle")}>
      <div className="cardHeader">
        <h2>{t("pinnedProductTitle")}</h2>
        <span className="status">{t("liveCommerce")}</span>
      </div>
      <div className="pinnedProductBody">
        <div className="pinnedProductTopRow">
          <span className="pinnedProductBadge">{t("presenting")}</span>
          <span className="pinnedProductTryOnBadge">{getTryOnLabel(product.arEffectType)}</span>
        </div>

        <h3>{product.name}</h3>
        <p className="pinnedProductPrice">{formatVnd(product.price)}</p>
        <p className="panelDescription">{product.description}</p>

        <div className="pinnedProductStatusRow">
          <span className={`pinnedProductStockBadge ${stockClass}`}>{stockLabel}</span>
          <span className="pinnedProductStockCount">{t("inStock", { count: product.stock })}</span>
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
          {t("viewProduct")} · {product.productUrl}
        </a>
      </div>
    </section>
  );
}
