import { useI18n } from "../../i18n/I18nProvider";
import type { AdultModerationView } from "../adult-moderation/useAdultModeration";
import type { DemoGunDetectorView } from "../weapon-frame-gate/useDemoGunDetector";
import type { WeaponFrameGateView } from "../weapon-frame-gate/useWeaponFrameGate";
import type { SharpObjectEnforcementResult } from "./sharpObjectEnforcementPolicy";
import type { VisualModerationResult } from "./visualModerationPolicy";
import {
  isViolatingSafetyKey,
  resolveAdultSafetyKey,
  resolveGunSafetyKey,
  resolveSharpSafetyKey,
} from "./visualSafetyStatus";

function rowClassName(violating: boolean): string {
  return violating ? "visualSafetyRow visualSafetyRowViolation" : "visualSafetyRow";
}

type VisualModerationBannerProps = {
  enabled: boolean;
  result: VisualModerationResult;
  enforcement: SharpObjectEnforcementResult;
  adultGate?: AdultModerationView | null;
  /** @deprecated prefer adultGate */
  nsfwGate?: AdultModerationView | null;
  weaponGate?: (WeaponFrameGateView | DemoGunDetectorView) | null;
  terminated: boolean;
  /** Rising-edge warning strikes toward auto end-stream. */
  violationStrikeCount?: number;
  violationStrikeLimit?: number;
  /** Mirrors VITE_SHARP_OBJECT_MODERATION_ENABLED so the row matches the running config. */
  sharpModerationEnabled?: boolean;
};

export function VisualModerationBanner({
  enabled,
  result,
  enforcement,
  adultGate = null,
  nsfwGate = null,
  weaponGate = null,
  terminated,
  violationStrikeCount = 0,
  violationStrikeLimit = 5,
  sharpModerationEnabled = true,
}: VisualModerationBannerProps) {
  const { t } = useI18n();
  const adult = adultGate ?? nsfwGate;

  if (!enabled && !terminated) {
    return null;
  }

  const gunState = weaponGate?.result.state ?? "safe";
  const adultWarning =
    adult?.result.state === "SUGGESTIVE" || adult?.result.state === "EXPLICIT";
  const sharpWarning =
    enforcement.action === "warning" || enforcement.action === "terminate";
  const elevated =
    terminated ||
    sharpWarning ||
    adultWarning ||
    gunState === "warning" ||
    gunState === "confirmed_risk" ||
    result.status === "warning";

  const adultKey = resolveAdultSafetyKey(adult);
  const sharpKey = resolveSharpSafetyKey(enforcement, terminated, sharpModerationEnabled);
  const selectionMode =
    weaponGate && "selection" in weaponGate ? weaponGate.selection.mode : null;
  const gunKey =
    selectionMode === "unavailable"
      ? "visualSafetyGunUnavailable"
      : resolveGunSafetyKey(weaponGate);

  return (
    <div
      className={
        terminated
          ? "visualModerationBanner visualModerationBannerTerminated"
          : elevated
            ? "visualModerationBanner visualModerationBannerWarning"
            : "visualModerationBanner visualModerationBannerSafe"
      }
      role={elevated || terminated ? "alert" : "status"}
    >
      <strong>{t("visualSafetyTitle")}</strong>

      {!terminated ? (
        <p className="visualSafetyStrikeLine">
          {t("visualSafetyViolationStrikes", {
            count: violationStrikeCount,
            limit: violationStrikeLimit,
          })}
        </p>
      ) : null}

      {terminated ? (
        <p className="visualModerationTerminatedLine">{t("visualModerationTerminated")}</p>
      ) : null}

      <ul className="visualSafetyList">
        <li className={rowClassName(isViolatingSafetyKey(adultKey))}>
          <span className="visualSafetyLabel">{t("visualSafetyAdultLabel")}</span>{" "}
          {adult?.errorMessage
            ? t("visualModerationAdultError", { detail: adult.errorMessage })
            : t(adultKey)}
        </li>
        <li className={rowClassName(isViolatingSafetyKey(sharpKey))}>
          <span className="visualSafetyLabel">{t("visualSafetySharpLabel")}</span>{" "}
          {t(sharpKey)}
        </li>
        <li className={rowClassName(isViolatingSafetyKey(gunKey))}>
          <span className="visualSafetyLabel">{t("visualSafetyGunLabel")}</span>{" "}
          {weaponGate?.errorMessage
            ? t("visualModerationWeaponError", { detail: weaponGate.errorMessage })
            : t(gunKey)}
          {"selection" in (weaponGate ?? {}) && weaponGate && "selection" in weaponGate ? (
            <span className="visualSafetyDetectorHint">
              {" "}
              ({t(weaponGate.selection.labelKey)})
            </span>
          ) : null}
        </li>
      </ul>

      {!terminated &&
      result.findings.some((finding) => finding.code !== "sharp_object") ? (
        <ul>
          {result.findings
            .filter((finding) => finding.code !== "sharp_object")
            .map((finding) => (
              <li key={finding.code}>
                {formatFinding(finding.code, finding.personCount, t)}
              </li>
            ))}
        </ul>
      ) : null}

      <p className="visualModerationDisclaimer">
        {t(
          sharpModerationEnabled
            ? "visualModerationDisclaimer"
            : "visualModerationDisclaimerSharpOff",
        )}
      </p>
    </div>
  );
}

function formatFinding(
  code: "sharp_object" | "crowd" | "product_absence",
  personCount: number | undefined,
  t: (
    key: import("../../i18n/translations").TranslationKey,
    params?: Record<string, string | number>,
  ) => string,
): string {
  if (code === "sharp_object") {
    return t("visualModerationSharpObject");
  }
  if (code === "crowd") {
    return t("visualModerationCrowd", { count: personCount ?? 0 });
  }
  return t("visualModerationProductAbsence");
}
