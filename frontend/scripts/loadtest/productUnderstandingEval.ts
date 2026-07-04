import type { SalesNlpPipelineResult } from "../../src/features/sales-nlp/salesNlpTypes";
import { analyzeCase, type AnalyzedCase } from "./rootCauseAnalyzer";
import type { ProductUnderstandingCase, ProductUnderstandingExpectation } from "./productUnderstandingCases";

export type ProductUnderstandingMetrics = {
  exactMatchAttempts: number;
  exactMatchPass: number;
  ambiguousAttempts: number;
  ambiguousDetected: number;
  clarificationAttempts: number;
  clarificationCorrect: number;
  categoryAttempts: number;
  categoryNotPinned: number;
  wrongProductSelections: number;
  pinnedFallbackUsed: number;
  randomSelectionWithoutClarification: number;
};

export function createProductUnderstandingMetrics(): ProductUnderstandingMetrics {
  return {
    exactMatchAttempts: 0,
    exactMatchPass: 0,
    ambiguousAttempts: 0,
    ambiguousDetected: 0,
    clarificationAttempts: 0,
    clarificationCorrect: 0,
    categoryAttempts: 0,
    categoryNotPinned: 0,
    wrongProductSelections: 0,
    pinnedFallbackUsed: 0,
    randomSelectionWithoutClarification: 0,
  };
}

function hasCloseCandidates(result: SalesNlpPipelineResult): boolean {
  const candidates = result.explanation.productCandidates;
  if (candidates.length < 2) {
    return false;
  }
  const [first, second] = candidates;
  return Math.abs(first.score - second.score) <= 1;
}

function isClarificationResult(result: SalesNlpPipelineResult): boolean {
  return (
    result.explanation.isClarification ||
    result.explanation.contextSource === "clarification" ||
    result.contextSource === "clarification"
  );
}

export function evaluateProductUnderstandingCase(
  testCase: ProductUnderstandingCase,
  result: SalesNlpPipelineResult,
  disablePinnedFallback: boolean,
): {
  status: "PASS" | "FAIL" | "WARN" | "SKIP";
  messages: string[];
  analysis: AnalyzedCase | null;
} {
  const messages: string[] = [];
  let status: "PASS" | "FAIL" | "WARN" | "SKIP" = "PASS";
  const expect = testCase.expect;
  const explanation = result.explanation;

  if (expect?.requiresMl) {
    return {
      status: "SKIP",
      messages: ["Requires ML bridge; skipped in offline load test"],
      analysis: analyzeCase({
        status: "SKIP",
        comment: testCase.comment,
        messages: ["Requires ML bridge; skipped in offline load test"],
        explanation,
        expect,
        sourceGroup: testCase.group,
        isDeterministic: true,
      }),
    };
  }

  if (expect?.intent && !expect.allowAnyRecognizedIntent && explanation.intent !== expect.intent) {
    status = "FAIL";
    messages.push(`expected intent ${expect.intent} got ${explanation.intent}`);
  }

  if (expect?.contextSource && explanation.contextSource !== expect.contextSource) {
    status = "FAIL";
    messages.push(`expected context ${expect.contextSource} got ${explanation.contextSource}`);
  }

  if (expect?.productId && explanation.resolvedProductId !== expect.productId) {
    status = "FAIL";
    messages.push(`expected product ${expect.productId} got ${explanation.resolvedProductId}`);
  }

  if (expect?.expectExactProduct && expect.productId) {
    if (explanation.resolvedProductId !== expect.productId) {
      status = "FAIL";
      messages.push(`exact product mismatch: expected ${expect.productId}`);
    }
  }

  if (expect?.expectClarification) {
    if (!isClarificationResult(result)) {
      status = "FAIL";
      messages.push(`expected clarification got ${explanation.contextSource}`);
    }
  }

  const rejectPinnedFallback =
    expect?.rejectPinnedFallback === true ||
    (disablePinnedFallback && expect?.rejectPinnedFallback !== false);

  if (rejectPinnedFallback && explanation.contextSource === "pinned_product") {
    status = "FAIL";
    messages.push("pinned fallback used while disabled/unexpected");
  }

  if (expect?.expectAmbiguous || expect?.allowAmbiguous) {
    const close = hasCloseCandidates(result);
    const clarified = isClarificationResult(result);
    if (clarified && expect.rejectRandomSelection) {
      // Ambiguity correctly handled via clarification.
    } else if (!close && !clarified && expect.rejectRandomSelection) {
      status = status === "FAIL" ? "FAIL" : "WARN";
      messages.push(
        `ambiguous family but system picked single product ${explanation.resolvedProductName} without clarification`,
      );
    } else if (close && !clarified && expect.allowAmbiguous) {
      status = status === "FAIL" ? "FAIL" : "WARN";
      messages.push(
        `ambiguous candidates close: ${explanation.productCandidates
          .slice(0, 3)
          .map((candidate) => candidate.name)
          .join(", ")}; close candidates exist but system did not clarify`,
      );
    }
  }

  if (
    expect?.rejectRandomSelection &&
    !expect?.expectClarification &&
    !expect?.expectAmbiguous &&
    !expect?.allowAmbiguous &&
    !isClarificationResult(result) &&
    hasCloseCandidates(result)
  ) {
    status = status === "FAIL" ? "FAIL" : "WARN";
    messages.push("close candidates exist but system did not clarify");
  }

  const analysis = analyzeCase({
    status,
    comment: testCase.comment,
    messages,
    explanation,
    expect,
    sourceGroup: testCase.group,
    isDeterministic: true,
  });

  return { status, messages, analysis };
}

export function updateProductUnderstandingMetrics(
  metrics: ProductUnderstandingMetrics,
  testCase: ProductUnderstandingCase,
  result: SalesNlpPipelineResult,
  status: "PASS" | "FAIL" | "WARN" | "SKIP",
): void {
  const category = testCase.productUnderstandingCategory;
  const explanation = result.explanation;

  if (explanation.contextSource === "pinned_product") {
    metrics.pinnedFallbackUsed += 1;
  }

  if (category === "exact") {
    metrics.exactMatchAttempts += 1;
    if (status === "PASS") {
      metrics.exactMatchPass += 1;
    } else {
      metrics.wrongProductSelections += 1;
    }
  }

  if (category === "ambiguous" || category === "conflict") {
    metrics.ambiguousAttempts += 1;
    if (isClarificationResult(result) || explanation.contextSource === "clarification") {
      metrics.ambiguousDetected += 1;
    }
    if (
      !isClarificationResult(result) &&
      explanation.contextSource !== "clarification" &&
      status !== "PASS"
    ) {
      metrics.randomSelectionWithoutClarification += 1;
    }
  }

  if (category === "category") {
    metrics.categoryAttempts += 1;
    if (explanation.contextSource !== "pinned_product") {
      metrics.categoryNotPinned += 1;
    }
  }

  if (testCase.expect?.expectClarification) {
    metrics.clarificationAttempts += 1;
    if (isClarificationResult(result)) {
      metrics.clarificationCorrect += 1;
    }
  }
}

export function printProductUnderstandingReport(
  metrics: ProductUnderstandingMetrics,
  disablePinnedFallback: boolean,
) {
  console.log("");
  console.log("=== Product Understanding Audit ===");
  console.log(`Pinned fallback disabled: ${disablePinnedFallback ? "yes" : "no"}`);
  console.log(
    `Exact match: ${metrics.exactMatchPass}/${metrics.exactMatchAttempts} (${metrics.exactMatchAttempts > 0 ? ((metrics.exactMatchPass / metrics.exactMatchAttempts) * 100).toFixed(1) : "0"}%)`,
  );
  console.log(
    `Ambiguous/conflict detected: ${metrics.ambiguousDetected}/${metrics.ambiguousAttempts}`,
  );
  console.log(
    `Clarification correct: ${metrics.clarificationCorrect}/${metrics.clarificationAttempts}`,
  );
  console.log(
    `Category questions not pinned: ${metrics.categoryNotPinned}/${metrics.categoryAttempts}`,
  );
  console.log(`Wrong product selections: ${metrics.wrongProductSelections}`);
  console.log(`Pinned fallback used (context): ${metrics.pinnedFallbackUsed}`);
  console.log(
    `Random selection without clarification: ${metrics.randomSelectionWithoutClarification}`,
  );
}

export type ProductResolutionAuditPoint = {
  layer: string;
  file: string;
  effect: string;
};

export const PINNED_FALLBACK_AUDIT: ProductResolutionAuditPoint[] = [
  {
    layer: "Context resolver deictic chain",
    file: "productContextResolver.ts:resolveDeicticImplicitContext",
    effect: "Deictic comments use vision → manual → pinned",
  },
  {
    layer: "Context resolver non-deictic path",
    file: "productContextResolver.ts:resolveNonDeicticImplicitContext",
    effect: "Generic comments use vision/manual only; pinned excluded",
  },
  {
    layer: "Pipeline selectedProduct fallback",
    file: "salesNlpPipeline.ts:buildProductResolutionFromContext",
    effect: "contextResolution.product ?? fallbackProduct always fills object",
  },
  {
    layer: "Answer generation",
    file: "answerGenerator.ts:generateAnswer",
    effect: "Reply always names selectedProduct even if context was clarification",
  },
  {
    layer: "Production analytics",
    file: "processSalesComment.ts:117-123",
    effect: "UNKNOWN/IGNORE skips event; recognized intents attach resolved product",
  },
  {
    layer: "Loadtest random default",
    file: "sales-nlp-loadtest.ts:runPipelineCase",
    effect: "Random comments run with glasses-a unless no-pin mode",
  },
];
