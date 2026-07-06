import type { CatalogProduct } from "../product-catalog/productCatalogTypes";
import { getTryOnLabel } from "../product-catalog/productCatalogTypes";
import { useI18n } from "../../i18n/I18nProvider";
import { formatVnd } from "../sales-nlp/answerGenerator";

type PinnedProductPanelProps = {
  product: CatalogProduct | null;
  onUnpin?: () => void;
};

export function PinnedProductPanel({ product, onUnpin }: PinnedProductPanelProps) {
  const { t } = useI18n();

  return (
    <section className="pinnedProductPanel videoCard" aria-label={t("pinnedProductTitle")}>
      <div className="cardHeader">
        <h2>{t("pinnedProductTitle")}</h2>
        {product ? (
          <div className="pinnedProductHeaderActions">
            <span className="status statusPinned">{t("pinned")}</span>
            {onUnpin ? (
              <>
                <span className="pinnedProductHeaderDivider" aria-hidden="true">
                  ·
                </span>
                <button type="button" className="pinnedProductUnpinButton" onClick={onUnpin}>
                  {t("unpinProduct")}
                </button>
              </>
            ) : null}
          </div>
        ) : (
          <span className="status">{t("noPinnedProductStatus")}</span>
        )}
      </div>

      {product ? (
        <PinnedProductDetails product={product} t={t} />
      ) : (
        <div className="pinnedProductEmpty">
          <p className="pinnedProductEmptyTitle">{t("noPinnedProduct")}</p>
          <p className="panelDescription">{t("noPinnedProductHint")}</p>
        </div>
      )}
    </section>
  );
}

function PinnedProductDetails({
  product,
  t,
}: {
  product: CatalogProduct;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const stockClass =
    product.stock <= 0 ? "outOfStock" : product.stock <= 5 ? "lowStock" : "inStock";
  const stockLabel =
    product.stock <= 0 ? "Hết hàng" : product.stock <= 5 ? "Sắp hết hàng" : "Còn hàng";

  return (
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
  );
}
