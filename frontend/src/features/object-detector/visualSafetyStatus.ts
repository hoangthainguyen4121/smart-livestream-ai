/** Pure Visual Safety status labels for Adult / Sharp / Gun rows. */

import type { AdultModerationView } from "../adult-moderation/useAdultModeration";
import type { WeaponFrameGateView } from "../weapon-frame-gate/useWeaponFrameGate";
import type { SharpObjectEnforcementResult } from "./sharpObjectEnforcementPolicy";

export type VisualSafetyAdultKey =
  | "visualSafetyAdultUnavailable"
  | "visualSafetyAdultSafe"
  | "visualSafetyAdultSuggestiveWarning"
  | "visualSafetyAdultExplicitWarning";

export type VisualSafetySharpKey =
  | "visualSafetySharpSafe"
  | "visualSafetySharpWarning"
  | "visualSafetySharpDisabled";

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
  moderationEnabled = true,
): VisualSafetySharpKey {
  if (terminated || enforcement.action === "terminate" || enforcement.action === "warning") {
    return "visualSafetySharpWarning";
  }
  if (!moderationEnabled) {
    return "visualSafetySharpDisabled";
  }
  return "visualSafetySharpSafe";
}

const VIOLATING_SAFETY_KEYS: ReadonlySet<string> = new Set([
  "visualSafetyAdultSuggestiveWarning",
  "visualSafetyAdultExplicitWarning",
  "visualSafetySharpWarning",
  "visualSafetyGunWarning",
  "visualSafetyGunConfirmed",
]);

/** Rows whose status key already encodes an active violation get the highlighted style. */
export function isViolatingSafetyKey(
  key: VisualSafetyAdultKey | VisualSafetySharpKey | VisualSafetyGunKey,
): boolean {
  return VIOLATING_SAFETY_KEYS.has(key);
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
