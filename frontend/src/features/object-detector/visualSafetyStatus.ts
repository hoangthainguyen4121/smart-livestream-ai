/** Pure Visual Safety status labels for Adult / Sharp / Gun rows. */

import type { AdultModerationView } from "../adult-moderation/useAdultModeration";
import type { WeaponFrameGateView } from "../weapon-frame-gate/useWeaponFrameGate";
import type { SharpObjectEnforcementResult } from "./sharpObjectEnforcementPolicy";

export type VisualSafetyAdultKey =
  | "visualSafetyAdultUnavailable"
  | "visualSafetyAdultSafe"
  | "visualSafetyAdultSuggestiveWarning"
  | "visualSafetyAdultExplicitWarning";

export type VisualSafetySharpKey = "visualSafetySharpSafe" | "visualSafetySharpWarning";

export type VisualSafetyGunKey =
  | "visualSafetyGunUnavailable"
  | "visualSafetyGunScanning"
  | "visualSafetyGunWarning"
  | "visualSafetyGunConfirmed";

export function resolveAdultSafetyKey(
  adultGate: AdultModerationView | null,
): VisualSafetyAdultKey {
  if (!adultGate || !adultGate.uiEnabled || adultGate.backendEnabled === false) {
    return "visualSafetyAdultUnavailable";
  }
  if (adultGate.result.state === "EXPLICIT") {
    return "visualSafetyAdultExplicitWarning";
  }
  if (adultGate.result.state === "SUGGESTIVE") {
    return "visualSafetyAdultSuggestiveWarning";
  }
  return "visualSafetyAdultSafe";
}

export function resolveSharpSafetyKey(
  enforcement: SharpObjectEnforcementResult,
  terminated: boolean,
): VisualSafetySharpKey {
  if (terminated || enforcement.action === "terminate" || enforcement.action === "warning") {
    return "visualSafetySharpWarning";
  }
  return "visualSafetySharpSafe";
}

export function resolveGunSafetyKey(weaponGate: WeaponFrameGateView | null): VisualSafetyGunKey {
  if (!weaponGate || !weaponGate.uiEnabled || weaponGate.backendEnabled === false) {
    return "visualSafetyGunUnavailable";
  }
  if (weaponGate.result.state === "confirmed_risk") {
    return "visualSafetyGunConfirmed";
  }
  if (weaponGate.result.state === "warning") {
    return "visualSafetyGunWarning";
  }
  return "visualSafetyGunScanning";
}
