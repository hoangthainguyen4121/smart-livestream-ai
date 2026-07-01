import type { CatalogProduct } from "../product-catalog/productCatalogTypes";
import {
  PRODUCT_CONTEXT_SOURCE_LABELS,
  type ProductContextSource,
} from "../sales-nlp/productContextResolver";

type ProductContextControlProps = {
  pinnedProduct: CatalogProduct;
  cameraProduct: CatalogProduct | null;
  lastContextSource?: ProductContextSource | null;
  onMarkCameraProduct: () => void;
  onClearCameraProduct?: () => void;
};

export function ProductContextControl({
  pinnedProduct,
  cameraProduct,
  lastContextSource,
  onMarkCameraProduct,
  onClearCameraProduct,
}: ProductContextControlProps) {
  const activeSource = lastContextSource ?? (cameraProduct ? "camera_context" : "pinned_product");
  const activeProduct = cameraProduct ?? pinnedProduct;

  return (
    <section className="productContextControl videoCard" aria-label="Product context">
      <div className="cardHeader">
        <h2>Product context</h2>
        <span className="status">{PRODUCT_CONTEXT_SOURCE_LABELS[activeSource]}</span>
      </div>

      <div className="productContextBody">
        <p className="panelDescription">
          Sales assistant ưu tiên sản phẩm trong camera, sau đó sản phẩm ghim, rồi khớp tên trong
          catalog.
        </p>

        <div className="productContextCurrent">
          <span className="productContextLabel">Đang dùng</span>
          <strong>{activeProduct.name}</strong>
          <span className="productContextSourceBadge">
            {PRODUCT_CONTEXT_SOURCE_LABELS[activeSource]}
          </span>
        </div>

        {cameraProduct ? (
          <p className="productContextHint">
            Camera context: <strong>{cameraProduct.name}</strong>
          </p>
        ) : (
          <p className="productContextHint">Chưa đánh dấu sản phẩm trong camera.</p>
        )}

        <div className="productContextActions">
          <button type="button" onClick={onMarkCameraProduct}>
            Đánh dấu là sản phẩm trong camera
          </button>
          {cameraProduct && onClearCameraProduct ? (
            <button type="button" className="secondaryButton" onClick={onClearCameraProduct}>
              Xóa camera context
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
