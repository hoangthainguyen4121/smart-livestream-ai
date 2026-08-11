import { describe, expect, it } from "vitest";

import {
  appendWeaponEvidence,
  evaluateWeaponGate,
  isWeaponFrameGateUiEnabled,
  passesWeaponThreshold,
  pickTopGunHit,
  pruneWeaponEvidence,
  shouldSkipBusySample,
} from "./weaponFrameGatePolicy";

describe("weaponFrameGatePolicy", () => {
  it("defaults UI flag off", () => {
    expect(isWeaponFrameGateUiEnabled({})).toBe(false);
    expect(isWeaponFrameGateUiEnabled({ VITE_WEAPON_DETECTOR_ENABLED: "true" })).toBe(true);
  });

  it("filters by threshold 0.42 / 0.45 / 0.50", () => {
    expect(passesWeaponThreshold(0.42, 0.42)).toBe(true);
    expect(passesWeaponThreshold(0.419, 0.42)).toBe(false);
    expect(passesWeaponThreshold(0.45, 0.45)).toBe(true);
    expect(passesWeaponThreshold(0.449, 0.45)).toBe(false);
    expect(passesWeaponThreshold(0.5, 0.5)).toBe(true);
    expect(passesWeaponThreshold(0.499, 0.5)).toBe(false);
  });

  it("supports Custom YOLOX thr 0.02 and Subh775 thr 0.65 separately", () => {
    expect(passesWeaponThreshold(0.02, 0.02)).toBe(true);
    expect(passesWeaponThreshold(0.019, 0.02)).toBe(false);
    expect(passesWeaponThreshold(0.65, 0.65)).toBe(true);
    expect(passesWeaponThreshold(0.64, 0.65)).toBe(false);
  });

  it("picks gun-family only and ignores knife/scissors", () => {
    const hit = pickTopGunHit(
      [
        { label: "knife", score: 0.99 },
        { label: "scissors", score: 0.98 },
        { label: "pistol", score: 0.46 },
        { label: "firearm", score: 0.44 },
      ],
      0.42,
      1_000,
    );
    expect(hit?.label).toBe("pistol");
    expect(hit?.score).toBe(0.46);
  });

  it("warns on first hit and confirms on second within window", () => {
    const windowMs = 35_000;
    const config = { requiredHits: 2, minScore: 0.42, autoTerminate: false };

    let hits = appendWeaponEvidence(
      [],
      {
        atMs: 1_000,
        score: 0.46,
        label: "pistol",
        fingerprint: "pistol|0.460|1,2,3,4",
      },
      windowMs,
    );
    expect(evaluateWeaponGate(hits, config).state).toBe("warning");

    hits = appendWeaponEvidence(
      hits,
      {
        atMs: 12_000,
        score: 0.51,
        label: "firearm",
        fingerprint: "firearm|0.510|5,6,7,8",
      },
      windowMs,
    );
    const confirmed = evaluateWeaponGate(hits, config);
    expect(confirmed.state).toBe("confirmed_risk");
    expect(confirmed.evidenceCount).toBe(2);
    expect(confirmed.autoTerminates).toBe(false);
  });

  it("does not count duplicate fingerprints or same timestamp", () => {
    const windowMs = 35_000;
    const fingerprint = "pistol|0.463|10,20,30,40";
    let hits = appendWeaponEvidence(
      [],
      { atMs: 1_000, score: 0.463, label: "pistol", fingerprint },
      windowMs,
    );
    hits = appendWeaponEvidence(
      hits,
      { atMs: 2_000, score: 0.463, label: "pistol", fingerprint },
      windowMs,
    );
    expect(hits).toHaveLength(1);

    hits = appendWeaponEvidence(
      hits,
      { atMs: 1_000, score: 0.55, label: "gun", fingerprint: "gun|0.550|1,1,2,2" },
      windowMs,
    );
    expect(hits).toHaveLength(1);
  });

  it("prunes stale evidence outside the sampling window", () => {
    const hits = pruneWeaponEvidence(
      [
        {
          atMs: 0,
          score: 0.9,
          label: "rifle",
          fingerprint: "rifle|0.900|0",
        },
        {
          atMs: 20_000,
          score: 0.8,
          label: "pistol",
          fingerprint: "pistol|0.800|1",
        },
      ],
      40_000,
      35_000,
    );
    expect(hits.map((hit) => hit.label)).toEqual(["pistol"]);
  });

  it("busy gate drops while inference is in flight", () => {
    expect(shouldSkipBusySample(true)).toBe(true);
    expect(shouldSkipBusySample(false)).toBe(false);
  });

  it("benign / below-threshold scores stay safe", () => {
    const hits = appendWeaponEvidence(
      [],
      pickTopGunHit([{ label: "pistol", score: 0.41, box: [0, 0, 1, 1] }], 0.42, 1_000),
      35_000,
    );
    expect(evaluateWeaponGate(hits, { requiredHits: 2, minScore: 0.42, autoTerminate: false }).state).toBe(
      "safe",
    );
  });
});
