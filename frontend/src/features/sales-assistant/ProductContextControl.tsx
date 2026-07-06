import type { CatalogProduct } from "../product-catalog/productCatalogTypes";
import type { CameraProductDetectionState } from "../camera-product-recognition/types";
import {
  PRODUCT_CONTEXT_SOURCE_LABELS,
  type ProductContextSource,
} from "../sales-nlp/productContextResolver";
import { useI18n } from "../../i18n/I18nProvider";

type ProductContextControlProps = {
  pinnedProduct: CatalogProduct | null;
  cameraProduct: CatalogProduct | null;
  lastContextSource?: ProductContextSource | null;
  visionEnabled?: boolean;
  visionDetection?: CameraProductDetectionState & {
    handDetected?: boolean;
    holdsObject?: boolean;
    embedder?: "clip" | "fingerprint" | null;
    mode?: "hand_held_embedding" | "legacy_dhash" | "disabled";
  };
  visionMode?: "hand_held_embedding" | "legacy_dhash" | "disabled";
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
  visionMode = "disabled",
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
    (activeVisionProduct
      ? "camera_vision"
      : cameraProduct
        ? "camera_context"
        : pinnedProduct
          ? "pinned_product"
          : "clarification");
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
            <p className="productContextHint">{t("visionOn")}</p>
            {visionMode === "hand_held_embedding" ? (
              <>
                <p className="productContextHint">
                  {t("handDetectionStatus")}:{" "}
                  <strong>
                    {visionDetection?.handDetected ? t("handDetectionYes") : t("handDetectionNo")}
                  </strong>
                </p>
                <p className="productContextHint">
                  {t("visionEmbedder")}: <strong>{visionDetection?.embedder ?? t("none")}</strong>
                </p>
                <p className="productContextHint">
                  {t("handObjectStatus")}:{" "}
                  <strong>
                    {visionDetection?.holdsObject ? t("handObjectYes") : t("handObjectNo")}
                  </strong>
                </p>
                {!visionDetection?.handDetected && !visionDetection?.match ? (
                  <p className="productContextHint">{t("visionWaitingForHand")}</p>
                ) : null}
              </>
            ) : null}
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
          <strong>{activeProduct?.name ?? t("noPinnedProduct")}</strong>
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
          <button type="button" onClick={onMarkCameraProduct} disabled={!pinnedProduct}>
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
