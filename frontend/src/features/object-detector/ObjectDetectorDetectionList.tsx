import { useI18n } from "../../i18n/I18nProvider";
import { translateCocoLabel } from "./cocoLabelTranslations";
import type { ProductDetectionStatus } from "./productDetectionPolicy";
import type { ObjectDetectorSnapshot } from "./objectDetectorTypes";

type ObjectDetectorDetectionListProps = {
  enabled: boolean;
  status: ProductDetectionStatus;
  snapshot: ObjectDetectorSnapshot;
};

export function ObjectDetectorDetectionList({
  enabled,
  status,
  snapshot,
}: ObjectDetectorDetectionListProps) {
  const { t, locale } = useI18n();

  if (!enabled) {
    return null;
  }

  return (
    <div className="productDetectionPanel">
      <div className="productDetectionPanelHeader">
        <strong>{t("productDetectionTitle")}</strong>
        <span className="productDetectionStatus">{statusLabel(status, t)}</span>
      </div>
      <p className="productDetectionHint">{t("productDetectionGenericHint")}</p>
      {snapshot.detections.length === 0 ? (
        <p className="productDetectionEmpty">
          {status === "empty" ? t("productDetectionEmpty") : t("productDetectionWaiting")}
        </p>
      ) : (
        <ul className="productDetectionList">
          {snapshot.detections.map((hit, index) => (
            <li key={`${hit.label}-${index}-${hit.x.toFixed(0)}-${hit.y.toFixed(0)}`}>
              <span>{translateCocoLabel(hit.label, locale)}</span>
              <span>{(hit.score * 100).toFixed(0)}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function statusLabel(
  status: ProductDetectionStatus,
  t: (key: import("../../i18n/translations").TranslationKey) => string,
): string {
  switch (status) {
    case "loading":
      return t("productDetectionStatusLoading");
    case "detecting":
      return t("productDetectionStatusDetecting");
    case "empty":
      return t("productDetectionStatusEmpty");
    case "error":
      return t("productDetectionStatusError");
    case "paused":
      return t("productDetectionStatusPaused");
    default:
      return t("productDetectionStatusOff");
  }
}
