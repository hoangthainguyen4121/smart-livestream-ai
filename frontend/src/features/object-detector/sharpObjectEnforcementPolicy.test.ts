import { describe, expect, it } from "vitest";

import type { ObjectDetectorHit } from "./objectDetectorTypes";
import {
  appendSharpObjectEvidence,
  evaluateSharpObjectEnforcement,
  pruneSharpObjectEvidence,
  readSharpObjectEnforcementConfig,
} from "./sharpObjectEnforcementPolicy";

const config = {
  minConfidence: 0.7,
  requiredHits: 3,
  windowMs: 5_000,
};

function hit(label: string, score: number, x = 1): ObjectDetectorHit {
  return { label, score, x, y: 2, width: 3, height: 4 };
}

describe("sharpObjectEnforcementPolicy", () => {
  it("does not terminate on a single detection", () => {
    const hits = appendSharpObjectEvidence([], [hit("knife", 0.9)], {
      nowMs: 1_000,
      snapshotUpdatedAt: 1,
      config,
      seenFingerprints: new Set(),
    });
    expect(evaluateSharpObjectEnforcement(hits, config).action).toBe("warning");
  });

  it("keeps warning at two detections", () => {
    const seen = new Set<string>();
    let hits = appendSharpObjectEvidence([], [hit("knife", 0.9, 1)], {
      nowMs: 1_000,
      snapshotUpdatedAt: 1,
      config,
      seenFingerprints: seen,
    });
    hits = appendSharpObjectEvidence(hits, [hit("scissors", 0.85, 2)], {
      nowMs: 1_200,
      snapshotUpdatedAt: 2,
      config,
      seenFingerprints: seen,
    });
    expect(evaluateSharpObjectEnforcement(hits, config)).toMatchObject({
      action: "warning",
      evidenceCount: 2,
    });
  });

  it("terminates after three valid hits inside the window", () => {
    const seen = new Set<string>();
    let hits = appendSharpObjectEvidence([], [hit("knife", 0.9, 1)], {
      nowMs: 1_000,
      snapshotUpdatedAt: 1,
      config,
      seenFingerprints: seen,
    });
    hits = appendSharpObjectEvidence(hits, [hit("knife", 0.91, 2)], {
      nowMs: 2_000,
      snapshotUpdatedAt: 2,
      config,
      seenFingerprints: seen,
    });
    hits = appendSharpObjectEvidence(hits, [hit("scissors", 0.8, 3)], {
      nowMs: 3_000,
      snapshotUpdatedAt: 3,
      config,
      seenFingerprints: seen,
    });
    expect(evaluateSharpObjectEnforcement(hits, config).action).toBe("terminate");
  });

  it("prunes hits outside the window", () => {
    const pruned = pruneSharpObjectEvidence(
      [
        {
          atMs: 0,
          label: "knife",
          confidence: 0.9,
          fingerprint: "old",
        },
        {
          atMs: 4_500,
          label: "scissors",
          confidence: 0.8,
          fingerprint: "new",
        },
      ],
      5_500,
      5_000,
    );
    expect(pruned).toHaveLength(1);
    expect(pruned[0]?.fingerprint).toBe("new");
  });

  it("ignores confidence below threshold", () => {
    const hits = appendSharpObjectEvidence([], [hit("knife", 0.69)], {
      nowMs: 1_000,
      snapshotUpdatedAt: 1,
      config,
      seenFingerprints: new Set(),
    });
    expect(hits).toHaveLength(0);
  });

  it("ignores non sharp-object labels", () => {
    const hits = appendSharpObjectEvidence([], [hit("person", 0.99), hit("baseball bat", 0.99)], {
      nowMs: 1_000,
      snapshotUpdatedAt: 1,
      config,
      seenFingerprints: new Set(),
    });
    expect(hits).toHaveLength(0);
  });

  it("does not double-count the same inference fingerprint", () => {
    const seen = new Set<string>();
    const detection = hit("knife", 0.9, 7);
    let hits = appendSharpObjectEvidence([], [detection], {
      nowMs: 1_000,
      snapshotUpdatedAt: 42,
      config,
      seenFingerprints: seen,
    });
    hits = appendSharpObjectEvidence(hits, [detection], {
      nowMs: 1_100,
      snapshotUpdatedAt: 42,
      config,
      seenFingerprints: seen,
    });
    expect(hits).toHaveLength(1);
  });

  it("reads vite config defaults", () => {
    expect(readSharpObjectEnforcementConfig({})).toEqual({
      minConfidence: 0.7,
      requiredHits: 3,
      windowMs: 5_000,
    });
  });
});
