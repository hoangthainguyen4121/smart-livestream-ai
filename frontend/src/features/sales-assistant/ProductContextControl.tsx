import type { CatalogProduct } from "../product-catalog/productCatalogTypes";
import type { CameraProductDetectionState } from "../camera-product-recognition/types";
import {
  PRODUCT_CONTEXT_SOURCE_LABELS,
  type ProductContextSource,
} from "../sales-nlp/productContextResolver";
import { useI18n } from "../../i18n/I18nProvider";

type ProductContextControlProps = {
  pinnedProduct: CatalogProduct;
  cameraProduct: CatalogProduct | null;
  lastContextSource?: ProductContextSource | null;
  visionEnabled?: boolean;
  visionDetection?: CameraProductDetectionState;
  activeVisionProduct?: CatalogProduct | null;
  onMarkCameraProduct: () => void;
  onClearCameraProduct?: () => void;
  onRecognizeNow?: () => void;
  onApplyVisionContext?: () => void;
  onClearVisionContext?: () => void;
};

export function ProductContextControl({
  pinnedProduct,
  cameraProduct,
  lastContextSource,
  visionEnabled = false,
  visionDetection,
  activeVisionProduct,
  onMarkCameraProduct,
  onClearCameraProduct,
  onRecognizeNow,
  onApplyVisionContext,
  onClearVisionContext,
}: ProductContextControlProps) {
  const { t } = useI18n();
  const activeSource =
    lastContextSource ??
    (activeVisionProduct ? "camera_vision" : cameraProduct ? "camera_context" : "pinned_product");
  const activeProduct = activeVisionProduct ?? cameraProduct ?? pinnedProduct;

  return (
    <section className="productContextControl videoCard" aria-label={t("productContext")}>
      <div className="cardHeader">
        <h2>{t("productContext")}</h2>
        <span className="status">{PRODUCT_CONTEXT_SOURCE_LABELS[activeSource]}</span>
      </div>

      <div className="productContextBody">
        <p className="panelDescription">{t("productContextHint")}</p>

        {visionEnabled ? (
          <div className="productContextVisionPanel">
            <p className="productContextHint">
              {t("visionOn")}
            </p>
            <p className="productContextHint">
              {t("detectedProduct")}:{" "}
              <strong>{visionDetection?.match?.productName ?? t("none")}</strong>
            </p>
            <p className="productContextHint">
              {t("confidence")}:{" "}
              <strong>
                {visionDetection?.match
                  ? `${(visionDetection.match.confidence * 100).toFixed(0)}%`
                  : t("none")}
              </strong>
            </p>
            <div className="productContextActions">
              <button type="button" onClick={onRecognizeNow} disabled={visionDetection?.isRunning}>
                {t("recognizeNow")}
              </button>
              <button
                type="button"
                onClick={onApplyVisionContext}
                disabled={!visionDetection?.match}
              >
                {t("useAsCameraContext")}
              </button>
              {activeVisionProduct && onClearVisionContext ? (
                <button type="button" className="secondaryButton" onClick={onClearVisionContext}>
                  {t("clearVisionContext")}
                </button>
              ) : null}
            </div>
            {visionDetection?.lastError ? (
              <p className="productContextHint">{visionDetection.lastError}</p>
            ) : null}
          </div>
        ) : null}

        <div className="productContextCurrent">
          <span className="productContextLabel">{t("currentlyUsing")}</span>
          <strong>{activeProduct.name}</strong>
          <span className="productContextSourceBadge">
            {PRODUCT_CONTEXT_SOURCE_LABELS[activeSource]}
          </span>
        </div>

        {cameraProduct ? (
          <p className="productContextHint">
            {t("cameraContextManual")}: <strong>{cameraProduct.name}</strong>
          </p>
        ) : (
          <p className="productContextHint">{t("noManualCameraContext")}</p>
        )}

        <div className="productContextActions">
          <button type="button" onClick={onMarkCameraProduct}>
            {t("markCameraProduct")}
          </button>
          {cameraProduct && onClearCameraProduct ? (
            <button type="button" className="secondaryButton" onClick={onClearCameraProduct}>
              {t("clearCameraContext")}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
