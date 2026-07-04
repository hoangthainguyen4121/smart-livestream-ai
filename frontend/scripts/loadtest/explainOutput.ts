import type { SalesNlpPipelineResult } from "../../src/features/sales-nlp/salesNlpTypes";
import type { CatalogProduct } from "../../src/features/product-catalog/productCatalogTypes";
import type { AnalyzedCase } from "./rootCauseAnalyzer";
import type { HardCaseExpectation, HardTestCase, LoadTestContext } from "./hardCases";
import type { LoadTestCliOptions } from "./cliArgs";

export type CaseVerdict = "PASS" | "FAIL" | "WARN" | "SKIP" | "INFO";

export type AnalyticsImpact = {
  productQuestionCounts: boolean;
  price: boolean;
  stock: boolean;
  link: boolean;
  purchase: boolean;
  complaint: boolean;
  clarification: boolean;
};

export type DetailedCaseActual = {
  intent: string;
  productId: string;
  productName: string;
  contextSource: string;
  action: string;
  confidence: number;
  reply: string;
};

export type DetailedCaseRecord = {
  id: string;
  group: string;
  scenario: string;
  comment: string;
  expected: HardCaseExpectation | null;
  actual: DetailedCaseActual;
  explanation: SalesNlpPipelineResult["explanation"];
  productCandidates: SalesNlpPipelineResult["explanation"]["productCandidates"];
  timingMs: number;
  verdict: CaseVerdict;
  rootCause: string | null;
  suggestedFix: string | null;
  reply: string;
  action: string;
  analyticsImpact: AnalyticsImpact;
  contextLabel: string;
  messages: string[];
};

const GROUP_ALIASES: Record<string, string[]> = {
  deictic: ["deictic", "matrix", "c-deictic", "i-matrix"],
  ambiguity: ["ambiguous", "e-ambiguous"],
  stock: ["stock", "ask_stock"],
  slang: ["slang", "b-slang"],
  explicit: ["explicit", "d-explicit"],
  multi: ["multi", "f-multi"],
  complaint: ["complaint", "h-complaint"],
  spam: ["spam", "h-spam"],
  noise: ["noise", "g-noise", "chitchat"],
  lipstick: ["lipstick", "l-exact", "l-ambiguous", "l-category", "l-conflict", "l-deictic"],
};

export function matchesGroupFilter(testCase: HardTestCase, filter: string): boolean {
  const aliases = GROUP_ALIASES[filter] ?? [filter];
  const haystack = [
    testCase.group,
    testCase.id,
    testCase.comment,
    testCase.scenario ?? "",
    testCase.expect?.intent ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return aliases.some((alias) => haystack.includes(alias));
}

export function buildContextFromCli(cli: LoadTestCliOptions, defaultPinnedId: string): LoadTestContext {
  const pinnedProductId = cli.productId ?? defaultPinnedId;
  const cameraProductId = cli.cameraProductId ?? "lipstick-ruby";

  switch (cli.contextMode) {
    case "no-context":
      return {
        label: "no-context",
        pinnedProductId,
        selectedCameraProductId: null,
        detectedCameraProductId: null,
      };
    case "manual-camera":
      return {
        label: "manual-camera",
        pinnedProductId,
        selectedCameraProductId: cameraProductId,
      };
    case "vision-enabled":
      return {
        label: "vision-enabled",
        pinnedProductId,
        detectedCameraProductId: cameraProductId,
        detectedCameraConfidence: cli.visionConfidence ?? 0.82,
      };
    case "vision-disabled":
      return {
        label: "vision-disabled",
        pinnedProductId,
        detectedCameraProductId: cameraProductId,
        detectedCameraConfidence: cli.visionConfidence ?? 0.2,
      };
    default:
      return { label: "pinned", pinnedProductId };
  }
}

export function estimateAnalyticsImpact(result: SalesNlpPipelineResult): AnalyticsImpact {
  const { explanation, intent, isComplaintEscalation, isSpamModeration } = result;
  const recognized = intent !== "UNKNOWN" && !explanation.suppressEvent;

  return {
    productQuestionCounts: recognized && !explanation.isClarification,
    price: intent === "ASK_PRICE",
    stock: intent === "ASK_STOCK",
    link: intent === "ASK_LINK",
    purchase: intent === "PURCHASE_INTENT",
    complaint: isComplaintEscalation || isSpamModeration,
    clarification: explanation.isClarification,
  };
}

export function buildExplanationSummary(explanation: SalesNlpPipelineResult["explanation"]): string {
  return [
    `intent=${explanation.intent} (${explanation.intentReason})`,
    `context=${explanation.contextSource} (${explanation.contextReason})`,
    `product=${explanation.resolvedProductName}`,
    `action=${explanation.action} (${explanation.actionReason})`,
    `reply=${explanation.replyReason}`,
  ].join(" | ");
}

export function buildDetailedRecord(input: {
  id: string;
  group: string;
  scenario?: string;
  comment: string;
  expected?: HardCaseExpectation;
  result: SalesNlpPipelineResult;
  latencyMs: number;
  verdict: CaseVerdict;
  analysis: AnalyzedCase | null;
  contextLabel: string;
  messages: string[];
}): DetailedCaseRecord {
  const { result } = input;
  const explanation = result.explanation;
  return {
    id: input.id,
    group: input.group,
    scenario: input.scenario ?? input.contextLabel,
    comment: input.comment,
    expected: input.expected ?? null,
    actual: {
      intent: explanation.intent,
      productId: explanation.resolvedProductId,
      productName: explanation.resolvedProductName,
      contextSource: explanation.contextSource,
      action: explanation.action,
      confidence: explanation.confidence,
      reply: explanation.reply,
    },
    explanation,
    productCandidates: explanation.productCandidates,
    timingMs: input.latencyMs,
    verdict: input.verdict,
    rootCause: input.analysis?.rootCause ?? null,
    suggestedFix: input.analysis?.suggestedFix ?? null,
    reply: explanation.reply,
    action: explanation.action,
    analyticsImpact: estimateAnalyticsImpact(result),
    contextLabel: input.contextLabel,
    messages: input.messages,
  };
}

function formatProductRef(catalog: CatalogProduct[], productId: string | null | undefined): string {
  if (!productId) {
    return "(none)";
  }
  const product = catalog.find((entry) => entry.id === productId);
  return product ? `${product.name} (${product.id})` : productId;
}

export function printSingleCaseExplain(input: {
  comment: string;
  cli: LoadTestCliOptions;
  context: LoadTestContext;
  catalog: CatalogProduct[];
  pinnedProduct: CatalogProduct;
  result: SalesNlpPipelineResult;
  latencyMs: number;
  verdict: CaseVerdict;
  analysis: AnalyzedCase | null;
  expected?: HardCaseExpectation;
}) {
  const { comment, cli, context, catalog, pinnedProduct, result, latencyMs, verdict, analysis, expected } =
    input;
  const { explanation } = result;
  const analytics = estimateAnalyticsImpact(result);

  console.log("=== Sales NLP Single-Case Explanation ===");
  console.log("");
  console.log("Input");
  console.log(`  Comment: ${comment}`);
  console.log(`  Scenario/context: ${context.label ?? cli.contextMode}`);
  console.log(`  Pinned product: ${pinnedProduct.name} (${pinnedProduct.id})`);
  console.log(
    `  Manual camera product: ${formatProductRef(catalog, context.selectedCameraProductId)}`,
  );
  console.log(
    `  Camera vision product: ${formatProductRef(catalog, context.detectedCameraProductId)}`,
  );
  console.log(
    `  Camera vision confidence: ${
      context.detectedCameraConfidence === null || context.detectedCameraConfidence === undefined
        ? "(not provided)"
        : context.detectedCameraConfidence
    }`,
  );
  console.log(`  Catalog size: ${catalog.length}`);
  console.log("");
  console.log("Normalization & Intent");
  console.log(`  Normalized text: ${explanation.normalizedText}`);
  console.log(`  Regex intent: ${explanation.regexIntent}`);
  console.log(`  Regex patterns: ${explanation.regexMatchedPatterns.join(", ") || "(none)"}`);
  console.log(`  ML intent: ${explanation.mlRawIntent ?? "not used"}`);
  console.log(`  Final intent: ${explanation.intent}`);
  console.log(`  Intent source: ${explanation.intentSource}`);
  console.log(`  Intent reason: ${explanation.intentReason}`);
  console.log(`  Confidence: ${explanation.confidence.toFixed(3)}`);
  console.log("");
  console.log("Product Resolution");
  console.log(`  Resolved product: ${explanation.resolvedProductName} (${explanation.resolvedProductId})`);
  console.log(`  Context source: ${explanation.contextSource}`);
  console.log(`  Product confidence: ${result.productConfidence.toFixed(3)}`);
  console.log(`  Context reason: ${explanation.contextReason}`);
  console.log("  Top product candidates:");
  if (explanation.productCandidates.length === 0) {
    console.log("    (none)");
  } else {
    for (const candidate of explanation.productCandidates.slice(0, 8)) {
      console.log(
        `    - ${candidate.name} (${candidate.id}) score=${candidate.score} terms=[${candidate.matchedTerms.join(", ")}]`,
      );
    }
  }
  console.log("");
  console.log("Action & Reply");
  console.log(`  Action: ${explanation.action}`);
  console.log(`  Action reason: ${explanation.actionReason}`);
  console.log(`  Reply: ${explanation.reply || "(empty)"}`);
  console.log(`  Reply reason: ${explanation.replyReason}`);
  console.log(
    `  Commerce suggested actions: ${
      result.commerceActions.length > 0
        ? result.commerceActions.map((action) => action.type).join(", ")
        : "(none)"
    }`,
  );
  console.log("");
  console.log("Analytics Impact (estimated)");
  console.log(`  productQuestionCounts: ${analytics.productQuestionCounts ? "yes" : "no"}`);
  console.log(`  price: ${analytics.price ? "yes" : "no"}`);
  console.log(`  stock: ${analytics.stock ? "yes" : "no"}`);
  console.log(`  link: ${analytics.link ? "yes" : "no"}`);
  console.log(`  purchase: ${analytics.purchase ? "yes" : "no"}`);
  console.log(`  complaint: ${analytics.complaint ? "yes" : "no"}`);
  console.log(`  clarification: ${analytics.clarification ? "yes" : "no"}`);
  console.log("");
  console.log("Verdict");
  console.log(`  Status: ${verdict}`);
  if (expected) {
    console.log(`  Expected: ${JSON.stringify(expected)}`);
  }
  if (analysis && verdict !== "PASS" && verdict !== "INFO") {
    console.log(`  Root cause: ${analysis.rootCause}`);
    console.log(`  Suggested fix: ${analysis.suggestedFix}`);
  }
  console.log(`  Latency: ${latencyMs.toFixed(2)} ms`);
}

export function printVerboseDeterministicCase(record: DetailedCaseRecord) {
  console.log("");
  console.log(`[${record.verdict}] ${record.group} | scenario=${record.scenario}`);
  console.log(`  Comment: ${record.comment}`);
  console.log(
    `  Expected: intent=${record.expected?.intent ?? "-"} product=${record.expected?.productId ?? "-"} context=${record.expected?.contextSource ?? "-"} action=${record.expected?.action ?? "-"}`,
  );
  console.log(
    `  Actual: intent=${record.actual.intent} product=${record.actual.productId} context=${record.actual.contextSource} action=${record.actual.action}`,
  );
  console.log(`  Reply: ${record.reply || "(empty)"}`);
  console.log(`  Explanation: ${buildExplanationSummary(record.explanation)}`);
  if (record.rootCause) {
    console.log(`  Root cause: ${record.rootCause}`);
    console.log(`  Suggested fix: ${record.suggestedFix}`);
  }
  if (record.messages.length > 0) {
    console.log(`  Notes: ${record.messages.join("; ")}`);
  }
  console.log(`  Timing: ${record.timingMs.toFixed(2)} ms`);
}

export function printDetailedFailure(record: DetailedCaseRecord) {
  console.log("");
  console.log(`--- ${record.verdict} [${record.group}] ${record.comment} ---`);
  console.log(`Scenario: ${record.scenario}`);
  if (record.expected) {
    console.log(`Expected: ${JSON.stringify(record.expected)}`);
  }
  console.log(`Actual: intent=${record.actual.intent} product=${record.actual.productName} context=${record.actual.contextSource} action=${record.actual.action}`);
  console.log(`Normalized: ${record.explanation.normalizedText}`);
  console.log(`Intent reason: ${record.explanation.intentReason}`);
  console.log(`Context reason: ${record.explanation.contextReason}`);
  console.log(
    `Candidates: ${record.productCandidates.map((c) => `${c.name}(${c.score})`).join(", ") || "none"}`,
  );
  console.log(`Action reason: ${record.explanation.actionReason}`);
  console.log(`Reply reason: ${record.explanation.replyReason}`);
  console.log(`Reply: ${record.reply || "(empty)"}`);
  if (record.rootCause) {
    console.log(`Root cause: ${record.rootCause}`);
    console.log(`Suggested fix: ${record.suggestedFix}`);
  }
}

export function printFinalSummary(input: {
  passCount: number;
  failCount: number;
  warnCount: number;
  skipCount: number;
  randomProcessed: number;
  randomSuspiciousFail: number;
  randomSuspiciousWarn: number;
  avgLatency: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  maxLatency: number;
  throughput: number;
  memoryDelta: number | null;
  memoryEndMb: number | null;
  intentDistribution: Record<string, number>;
  contextDistribution: Record<string, number>;
  actionDistribution: Record<string, number>;
  rootCauseDistribution: Record<string, number>;
  retrainCandidateCount: number;
  reportPaths: string[];
  topProducts: Array<{ productName: string; count: number }>;
  topIssues: DetailedCaseRecord[];
  topSlowest: Array<{ latencyMs: number; group: string; comment: string }>;
}) {
  console.log("");
  console.log("=== Summary ===");
  console.log(
    `Deterministic: PASS ${input.passCount} | FAIL ${input.failCount} | WARN ${input.warnCount} | SKIP ${input.skipCount}`,
  );
  console.log(`Random processed: ${input.randomProcessed}`);
  console.log(
    `Random suspicious: FAIL ${input.randomSuspiciousFail} | WARN ${input.randomSuspiciousWarn}`,
  );
  console.log(
    `Latency avg/p50/p95/p99/max: ${input.avgLatency.toFixed(2)} / ${input.p50Latency.toFixed(2)} / ${input.p95Latency.toFixed(2)} / ${input.p99Latency.toFixed(2)} / ${input.maxLatency.toFixed(2)} ms`,
  );
  console.log(`Throughput: ${input.throughput.toFixed(1)} comments/sec`);
  if (input.memoryDelta !== null && input.memoryEndMb !== null) {
    console.log(`Memory delta: ${input.memoryDelta.toFixed(2)} MB (heap ${input.memoryEndMb} MB)`);
  }
  console.log("Intent distribution:", input.intentDistribution);
  console.log("Context source distribution:", input.contextDistribution);
  console.log("Action distribution:", input.actionDistribution);
  console.log("Root cause distribution:", input.rootCauseDistribution);
  console.log(`Retrain candidates: ${input.retrainCandidateCount}`);
  console.log("Report files:");
  for (const path of input.reportPaths) {
    console.log(`  ${path}`);
  }
  console.log("Top 10 products:");
  for (const product of input.topProducts) {
    console.log(`  ${product.productName}: ${product.count}`);
  }
  console.log("Top failures/warnings:");
  for (const issue of input.topIssues.slice(0, 20)) {
    console.log(`  [${issue.verdict}] ${issue.group} | ${issue.comment}`);
    if (issue.rootCause) {
      console.log(`    cause=${issue.rootCause} fix=${issue.suggestedFix}`);
    }
  }
  console.log("Top 20 slowest cases:");
  for (const entry of input.topSlowest) {
    console.log(`  ${entry.latencyMs.toFixed(2)} ms [${entry.group}] ${entry.comment}`);
  }
}
