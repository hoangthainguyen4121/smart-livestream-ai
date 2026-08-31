import { describe, expect, it } from "vitest";

import type { AdultModerationView } from "../adult-moderation/useAdultModeration";
import type { WeaponFrameGateView } from "../weapon-frame-gate/useWeaponFrameGate";
import {
  isViolatingSafetyKey,
  resolveAdultSafetyKey,
  resolveGunSafetyKey,
  resolveSharpSafetyKey,
} from "./visualSafetyStatus";

function adultView(state: "SAFE" | "SUGGESTIVE" | "EXPLICIT"): AdultModerationView {
  return {
    uiEnabled: true,
    backendEnabled: true,
    ready: true,
    status: null,
    result: {
      state,
      evidenceCount: state === "SAFE" ? 0 : 2,
      requiredHits: 2,
      suggestiveEvidenceCount: state === "SAFE" ? 0 : 2,
      explicitEvidenceCount: state === "EXPLICIT" ? 2 : 0,
      hits: [],
    },
    lastFrameState: state,
    lastClassify: null,
    errorMessage: null,
    inFlight: false,
    analyzeCurrentFrame: async () => undefined,
    resetEvidence: () => undefined,
  };
}

function weaponView(state: "safe" | "warning" | "confirmed_risk"): WeaponFrameGateView {
  return {
    uiEnabled: true,
    backendEnabled: true,
    ready: true,
    status: null,
    result: {
      state,
      action: state,
      evidenceCount: state === "safe" ? 0 : state === "warning" ? 1 : 2,
      requiredHits: 2,
      latestScore: state === "safe" ? null : 0.5,
      latestLabel: state === "safe" ? null : "pistol",
      hits: [],
      autoTerminates: false,
    },
    lastDetections: [],
    lastRawScore: null,
    lastConfThreshold: null,
    lastInferenceMs: null,
    lastStartedAtMs: null,
    lastCompletedAtMs: null,
    errorMessage: null,
    inFlight: false,
    skippedBusyCount: 0,
    completedSamples: 0,
    scanCurrentFrame: async () => undefined,
    resetEvidence: () => undefined,
  };
}

describe("visualSafetyStatus", () => {
  it("maps adult SAFE / SUGGESTIVE / EXPLICIT", () => {
    expect(resolveAdultSafetyKey(adultView("SAFE"))).toBe("visualSafetyAdultSafe");
    expect(resolveAdultSafetyKey(adultView("SUGGESTIVE"))).toBe(
      "visualSafetyAdultSuggestiveWarning",
    );
    expect(resolveAdultSafetyKey(adultView("EXPLICIT"))).toBe(
      "visualSafetyAdultExplicitWarning",
    );
    expect(
      resolveAdultSafetyKey({
        ...adultView("SAFE"),
        uiEnabled: false,
      }),
    ).toBe("visualSafetyAdultUnavailable");
  });

  it("maps sharp safe vs warning without regressing terminate signal", () => {
    expect(
      resolveSharpSafetyKey(
        {
          action: "none",
          evidenceCount: 0,
          requiredHits: 3,
          label: null,
          confidence: null,
          hits: [],
        },
        false,
      ),
    ).toBe("visualSafetySharpSafe");
    expect(
      resolveSharpSafetyKey(
        {
          action: "warning",
          evidenceCount: 2,
          requiredHits: 3,
          label: "knife",
          confidence: 0.8,
          hits: [],
        },
        false,
      ),
    ).toBe("visualSafetySharpWarning");
    expect(
      resolveSharpSafetyKey(
        {
          action: "none",
          evidenceCount: 0,
          requiredHits: 3,
          label: null,
          confidence: null,
          hits: [],
        },
        true,
      ),
    ).toBe("visualSafetySharpWarning");
  });

  it("reports sharp moderation as disabled while warnings still surface", () => {
    const idle = {
      action: "none",
      evidenceCount: 0,
      requiredHits: 3,
      label: null,
      confidence: null,
      hits: [],
    } as const;

    expect(resolveSharpSafetyKey(idle, false, false)).toBe("visualSafetySharpDisabled");
    expect(resolveSharpSafetyKey({ ...idle, action: "warning" }, false, false)).toBe(
      "visualSafetySharpWarning",
    );
    expect(resolveSharpSafetyKey(idle, true, false)).toBe("visualSafetySharpWarning");
  });

  it("maps gun scanning / warning / confirmed_risk UI keys", () => {
    expect(resolveGunSafetyKey(weaponView("safe"))).toBe("visualSafetyGunScanning");
    expect(resolveGunSafetyKey(weaponView("warning"))).toBe("visualSafetyGunWarning");
    expect(resolveGunSafetyKey(weaponView("confirmed_risk"))).toBe("visualSafetyGunConfirmed");
  });

  it("flags only the rows that are actively violating", () => {
    expect(isViolatingSafetyKey("visualSafetyAdultSuggestiveWarning")).toBe(true);
    expect(isViolatingSafetyKey("visualSafetyAdultExplicitWarning")).toBe(true);
    expect(isViolatingSafetyKey("visualSafetySharpWarning")).toBe(true);
    expect(isViolatingSafetyKey("visualSafetyGunWarning")).toBe(true);
    expect(isViolatingSafetyKey("visualSafetyGunConfirmed")).toBe(true);

    expect(isViolatingSafetyKey("visualSafetyAdultSafe")).toBe(false);
    expect(isViolatingSafetyKey("visualSafetySharpSafe")).toBe(false);
    expect(isViolatingSafetyKey("visualSafetySharpDisabled")).toBe(false);
    expect(isViolatingSafetyKey("visualSafetyGunScanning")).toBe(false);
    expect(isViolatingSafetyKey("visualSafetyGunUnavailable")).toBe(false);
  });
});
