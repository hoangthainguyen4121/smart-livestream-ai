#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runSalesNlpPipeline } from "../src/features/sales-nlp/salesNlpPipeline";
import type { SalesNlpPipelineResult } from "../src/features/sales-nlp/salesNlpTypes";
import type { CatalogProduct } from "../src/features/product-catalog/productCatalogTypes";
import {
  DEFAULT_LOADTEST_PINNED_PRODUCT_ID,
  findCatalogProduct,
  generateDummyCatalog,
} from "./fixtures/generateDummyCatalog";
import {
  DEFAULT_LIPSTICK_PINNED_PRODUCT_ID,
  findLipstickCatalogProduct,
  generateLipstickHeavyCatalog,
} from "./fixtures/generateLipstickCatalog";
import { parseLoadTestCliArgs } from "./loadtest/cliArgs";
import {
  buildContextFromCli,
  buildDetailedRecord,
  buildExplanationSummary,
  matchesGroupFilter,
  printDetailedFailure,
  printFinalSummary,
  printSingleCaseExplain,
  printVerboseDeterministicCase,
  type CaseVerdict,
  type DetailedCaseRecord,
} from "./loadtest/explainOutput";
import { buildHardTestCases, buildRandomComments, type HardTestCase } from "./loadtest/hardCases";
import {
  type LoadTestContextOptions,
  resolvePinnedProductForRun,
  resolveRuntimeContext,
} from "./loadtest/loadTestContext";
import { buildProductUnderstandingCases } from "./loadtest/productUnderstandingCases";
import {
  createProductUnderstandingMetrics,
  evaluateProductUnderstandingCase,
  PINNED_FALLBACK_AUDIT,
  printProductUnderstandingReport,
  updateProductUnderstandingMetrics,
  type ProductUnderstandingMetrics,
} from "./loadtest/productUnderstandingEval";
import {
  analyzeCase,
  analyzeSuspiciousRandomCase,
  type AnalyzedCase,
  type RootCause,
} from "./loadtest/rootCauseAnalyzer";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const reportsDir = join(scriptDir, "..", "reports");

type CaseStatus = Exclude<CaseVerdict, "INFO">;

type EvaluatedCase = {
  id: string;
  group: string;
  comment: string;
  contextLabel: string;
  scenario?: string;
  status: CaseStatus;
  latencyMs: number;
  expected?: HardTestCase["expect"];
  result: SalesNlpPipelineResult;
  messages: string[];
  isDeterministic: boolean;
  analysis: AnalyzedCase | null;
  detailed: DetailedCaseRecord;
};

type RandomEvaluatedCase = {
  id: string;
  group: string;
  comment: string;
  status: CaseStatus;
  latencyMs: number;
  result: SalesNlpPipelineResult;
  messages: string[];
  isDeterministic: false;
  analysis: AnalyzedCase | null;
  detailed: DetailedCaseRecord;
};

type Distribution = Record<string, number>;

type RetrainCandidate = {
  text: string;
  expectedIntent: string | null;
  actualIntent: string;
  expectedProduct: string | null;
  actualProduct: string;
  expectedContextSource: string | null;
  actualContextSource: string;
  rootCause: RootCause;
  suggestedFix: string;
  normalizedText: string;
  explanation: SalesNlpPipelineResult["explanation"];
  sourceGroup: string;
  severity: string;
  status: CaseStatus;
};

function increment(map: Distribution, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1);
  return sorted[index];
}

function readMemoryMb(): number | null {
  const memory = process.memoryUsage();
  return Number((memory.heapUsed / 1024 / 1024).toFixed(2));
}

type LoadTestRuntime = {
  catalog: CatalogProduct[];
  findProduct: (catalog: CatalogProduct[], productId: string) => CatalogProduct;
  defaultPinnedId: string;
  contextOptions: LoadTestContextOptions;
  disablePinnedFallback: boolean;
};

function buildLoadTestRuntime(cli: ReturnType<typeof parseLoadTestCliArgs>): LoadTestRuntime {
  const defaultPinnedId =
    cli.catalogMode === "lipstick-heavy"
      ? DEFAULT_LIPSTICK_PINNED_PRODUCT_ID
      : DEFAULT_LOADTEST_PINNED_PRODUCT_ID;
  const catalog =
    cli.catalogMode === "lipstick-heavy"
      ? generateLipstickHeavyCatalog({ totalCount: cli.products, seed: cli.seed })
      : generateDummyCatalog({ count: cli.products, seed: cli.seed });
  const findProduct =
    cli.catalogMode === "lipstick-heavy" ? findLipstickCatalogProduct : findCatalogProduct;
  const disablePinnedFallback =
    cli.disablePinnedFallback || cli.runContextMode === "no-pin";
  const contextOptions: LoadTestContextOptions = {
    runContextMode: cli.runContextMode,
    disablePinnedFallback,
    fallbackProductId: cli.productId ?? defaultPinnedId,
    cameraProductId: cli.cameraProductId ?? "lipstick-ruby-matte",
    visionConfidence: cli.visionConfidence ?? 0.82,
  };

  return {
    catalog,
    findProduct,
    defaultPinnedId,
    contextOptions,
    disablePinnedFallback,
  };
}

function isProductUnderstandingCase(testCase: HardTestCase): boolean {
  return testCase.group.startsWith("L-");
}

function runPipelineCase(
  runtime: LoadTestRuntime,
  comment: string,
  testCase?: HardTestCase,
): { result: SalesNlpPipelineResult; latencyMs: number; pinnedProduct: CatalogProduct } {
  const context = resolveRuntimeContext(testCase, runtime.contextOptions);
  const pinnedProduct = resolvePinnedProductForRun(
    runtime.catalog,
    runtime.findProduct,
    context,
    runtime.contextOptions,
  );
  const started = performance.now();
  const result = runSalesNlpPipeline({
    comment,
    catalog: runtime.catalog,
    pinnedProduct,
    selectedCameraProductId: context?.selectedCameraProductId ?? null,
    detectedCameraProductId: context?.detectedCameraProductId ?? null,
    detectedCameraConfidence: context?.detectedCameraConfidence ?? null,
    autoReplyInChat: true,
    mlBridge: null,
  });
  return { result, latencyMs: performance.now() - started, pinnedProduct };
}

function evaluateTestCase(
  runtime: LoadTestRuntime,
  testCase: HardTestCase,
  productMetrics: ProductUnderstandingMetrics,
): EvaluatedCase {
  const { result, latencyMs } = runPipelineCase(runtime, testCase.comment, testCase);

  if (isProductUnderstandingCase(testCase)) {
    const evaluated = evaluateProductUnderstandingCase(
      testCase,
      result,
      runtime.disablePinnedFallback,
    );
    updateProductUnderstandingMetrics(
      productMetrics,
      testCase,
      result,
      evaluated.status,
    );
    const detailed = buildDetailedRecord({
      id: testCase.id,
      group: testCase.group,
      scenario: testCase.scenario,
      comment: testCase.comment,
      expected: testCase.expect,
      result,
      latencyMs,
      verdict: evaluated.status,
      analysis: evaluated.analysis,
      contextLabel: testCase.context?.label ?? runtime.contextOptions.runContextMode,
      messages: evaluated.messages,
    });
    return {
      id: testCase.id,
      group: testCase.group,
      comment: testCase.comment,
      contextLabel: testCase.context?.label ?? runtime.contextOptions.runContextMode,
      scenario: testCase.scenario,
      status: evaluated.status,
      latencyMs,
      expected: testCase.expect,
      result,
      messages: evaluated.messages,
      isDeterministic: true,
      analysis: evaluated.analysis,
      detailed,
    };
  }

  return evaluateHardCase(runtime, testCase, result, latencyMs);
}

function evaluateHardCase(
  runtime: LoadTestRuntime,
  testCase: HardTestCase,
  result: SalesNlpPipelineResult,
  latencyMs: number,
): EvaluatedCase {
  const explanation = result.explanation;
  const messages: string[] = [];
  let status: CaseStatus = "PASS";
  const expect = testCase.expect;

  if (expect?.requiresMl) {
    const analysis = analyzeCase({
      status: "SKIP",
      comment: testCase.comment,
      messages: ["Requires ML bridge; skipped in offline load test"],
      explanation,
      expect,
      sourceGroup: testCase.group,
      isDeterministic: true,
    });
    const detailed = buildDetailedRecord({
      id: testCase.id,
      group: testCase.group,
      scenario: testCase.scenario,
      comment: testCase.comment,
      expected: expect,
      result,
      latencyMs,
      verdict: "SKIP",
      analysis,
      contextLabel: testCase.context?.label ?? "default",
      messages: ["Requires ML bridge; skipped in offline load test"],
    });
    return {
      id: testCase.id,
      group: testCase.group,
      comment: testCase.comment,
      contextLabel: testCase.context?.label ?? "default",
      scenario: testCase.scenario,
      status: "SKIP",
      latencyMs,
      expected: expect,
      result,
      messages: ["Requires ML bridge; skipped in offline load test"],
      isDeterministic: true,
      analysis,
      detailed,
    };
  }

  if (expect?.intent && explanation.intent !== expect.intent) {
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

  if (expect?.action && explanation.action !== expect.action) {
    status = "FAIL";
    messages.push(`expected action ${expect.action} got ${explanation.action}`);
  }

  if (expect?.allowAmbiguous && explanation.productCandidates.length >= 2) {
    const [first, second] = explanation.productCandidates;
    if (Math.abs(first.score - second.score) <= 1) {
      status = status === "FAIL" ? "FAIL" : "WARN";
      messages.push(
        `ambiguous product mention: matched ${first.name} but candidates were close (${second.name})`,
      );
    }
  }

  if (
    testCase.context?.label === "no-context" &&
    expect?.contextSource === "clarification" &&
    explanation.contextSource !== "clarification"
  ) {
    status = "FAIL";
    messages.push(`expected clarification without context got ${explanation.contextSource}`);
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

  const detailed = buildDetailedRecord({
    id: testCase.id,
    group: testCase.group,
    scenario: testCase.scenario,
    comment: testCase.comment,
    expected: expect,
    result,
    latencyMs,
    verdict: status,
    analysis,
    contextLabel: testCase.context?.label ?? "default",
    messages,
  });

  return {
    id: testCase.id,
    group: testCase.group,
    comment: testCase.comment,
    contextLabel: testCase.context?.label ?? "default",
    scenario: testCase.scenario,
    status,
    latencyMs,
    expected: expect,
    result,
    messages,
    isDeterministic: true,
    analysis,
    detailed,
  };
}

function toRetrainCandidate(entry: EvaluatedCase | RandomEvaluatedCase): RetrainCandidate | null {
  if (!entry.analysis) {
    return null;
  }
  const expected = "expected" in entry ? entry.expected : undefined;
  return {
    text: entry.comment,
    expectedIntent: expected?.intent ?? null,
    actualIntent: entry.result.explanation.intent,
    expectedProduct: expected?.productId ?? null,
    actualProduct: entry.result.explanation.resolvedProductId,
    expectedContextSource: expected?.contextSource ?? null,
    actualContextSource: entry.result.explanation.contextSource,
    rootCause: entry.analysis.rootCause,
    suggestedFix: entry.analysis.suggestedFix,
    normalizedText: entry.result.explanation.normalizedText,
    explanation: entry.result.explanation,
    sourceGroup: entry.group,
    severity: entry.analysis.severity,
    status: entry.status,
  };
}

function formatCompactLine(entry: EvaluatedCase): string {
  if (entry.status === "PASS") {
    return `PASS  [${entry.result.explanation.intent}] "${entry.comment}" -> ${entry.result.explanation.resolvedProductName} via ${entry.result.explanation.contextSource}`;
  }
  const rootCause = entry.analysis ? ` | ${entry.analysis.rootCause}` : "";
  const fix = entry.analysis ? ` | fix: ${entry.analysis.suggestedFix}` : "";
  return `${entry.status}  ${entry.messages.join("; ")}${rootCause}${fix}: "${entry.comment}"`;
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function runSingleCaseMode(runtime: LoadTestRuntime, cli: ReturnType<typeof parseLoadTestCliArgs>) {
  if (!cli.caseComment) {
    console.error("--case requires a comment string");
    process.exit(1);
  }

  const context =
    cli.disablePinnedFallback || cli.contextMode === "no-context"
      ? { label: "no-pin", pinnedProductId: runtime.defaultPinnedId }
      : buildContextFromCli(cli, runtime.defaultPinnedId);
  const pinnedProduct = resolvePinnedProductForRun(
    runtime.catalog,
    runtime.findProduct,
    context,
    runtime.contextOptions,
  );
  const started = performance.now();
  const result = runSalesNlpPipeline({
    comment: cli.caseComment,
    catalog: runtime.catalog,
    pinnedProduct,
    selectedCameraProductId: context.selectedCameraProductId ?? null,
    detectedCameraProductId: context.detectedCameraProductId ?? null,
    detectedCameraConfidence: context.detectedCameraConfidence ?? null,
    autoReplyInChat: true,
    mlBridge: null,
  });
  const latencyMs = performance.now() - started;

  if (!cli.explain) {
    console.log(JSON.stringify(result.explanation, null, 2));
    return;
  }

  printSingleCaseExplain({
    comment: cli.caseComment,
    cli,
    context,
    catalog: runtime.catalog,
    pinnedProduct,
    result,
    latencyMs,
    verdict: "INFO",
    analysis: null,
  });

  mkdirSync(reportsDir, { recursive: true });
  const detailedPath = join(reportsDir, "sales-nlp-loadtest-detailed-cases.jsonl");
  const record = buildDetailedRecord({
    id: "single-case",
    group: "single-case",
    scenario: context.label ?? cli.contextMode,
    comment: cli.caseComment,
    result,
    latencyMs,
    verdict: "INFO",
    analysis: null,
    contextLabel: context.label ?? cli.contextMode,
    messages: [],
  });
  writeFileSync(detailedPath, `${JSON.stringify(record)}\n`, "utf8");
  console.log("");
  console.log(`Detailed JSONL: ${detailedPath}`);
}

function shouldPrintDetailed(entry: EvaluatedCase, cli: ReturnType<typeof parseLoadTestCliArgs>): boolean {
  if (cli.verbose) {
    return true;
  }
  if (cli.onlyFailures) {
    return entry.status === "FAIL" || entry.status === "WARN" || entry.status === "SKIP";
  }
  return entry.status === "FAIL";
}

function printPinnedFallbackAudit() {
  console.log("");
  console.log("=== Pinned Fallback Audit (code path reference) ===");
  for (const point of PINNED_FALLBACK_AUDIT) {
    console.log(`- [${point.layer}] ${point.file}: ${point.effect}`);
  }
}

function main() {
  const cli = parseLoadTestCliArgs();
  const runtime = buildLoadTestRuntime(cli);
  const productMetrics = createProductUnderstandingMetrics();
  const memoryStartMb = readMemoryMb();

  if (cli.caseComment) {
    runSingleCaseMode(runtime, cli);
    return;
  }

  let hardCases =
    cli.groupFilter === "lipstick"
      ? buildProductUnderstandingCases()
      : buildHardTestCases();

  if (cli.groupFilter) {
    hardCases = hardCases.filter((testCase) => matchesGroupFilter(testCase, cli.groupFilter!));
    console.log(`Group filter "${cli.groupFilter}" matched ${hardCases.length} deterministic cases`);
    if (cli.groupFilter === "lipstick") {
      printPinnedFallbackAudit();
    }
  }

  const evaluatedHardCases = hardCases.map((testCase) =>
    evaluateTestCase(runtime, testCase, productMetrics),
  );

  const intentDistribution: Distribution = {};
  const actionDistribution: Distribution = {};
  const contextDistribution: Distribution = {};
  const rootCauseDistribution: Distribution = {};
  const randomLatencies: number[] = [];
  const randomEvaluated: RandomEvaluatedCase[] = [];
  const productQuestionCounts: Record<string, number> = {};
  let clarificationCount = 0;
  let unresolvedCount = 0;
  let randomFailCount = 0;
  let randomWarnCount = 0;

  const randomComments =
    cli.comments > 0 ? buildRandomComments(cli.comments * cli.iterations, cli.seed) : [];
  const randomStarted = performance.now();

  for (let index = 0; index < randomComments.length; index += 1) {
    const comment = randomComments[index];
    const { result, latencyMs } = runPipelineCase(runtime, comment);
    const explanation = result.explanation;
    randomLatencies.push(latencyMs);
    increment(intentDistribution, explanation.intent);
    increment(actionDistribution, explanation.action);
    increment(contextDistribution, explanation.contextSource);

    if (explanation.isClarification) {
      clarificationCount += 1;
    }
    if (explanation.intent === "UNKNOWN" || explanation.suppressEvent) {
      unresolvedCount += 1;
    }
    if (explanation.intent !== "UNKNOWN" && !explanation.isClarification) {
      productQuestionCounts[explanation.resolvedProductId] =
        (productQuestionCounts[explanation.resolvedProductId] ?? 0) + 1;
    }

    const suspicious = analyzeSuspiciousRandomCase({
      comment,
      explanation,
      sourceGroup: "R-random",
    });
    if (suspicious) {
      increment(rootCauseDistribution, suspicious.rootCause);
      const status: CaseStatus =
        suspicious.rootCause === "ML_REQUIRED" || suspicious.severity === "high" ? "FAIL" : "WARN";
      if (status === "FAIL") {
        randomFailCount += 1;
      } else {
        randomWarnCount += 1;
      }
      const detailed = buildDetailedRecord({
        id: `R-random-${index + 1}`,
        group: "R-random",
        comment,
        result,
        latencyMs,
        verdict: status,
        analysis: suspicious,
        contextLabel: runtime.contextOptions.runContextMode,
        messages: [`suspicious random case (${suspicious.rootCause})`],
      });
      randomEvaluated.push({
        id: `R-random-${index + 1}`,
        group: "R-random",
        comment,
        status,
        latencyMs,
        result,
        messages: [`suspicious random case (${suspicious.rootCause})`],
        isDeterministic: false,
        analysis: suspicious,
        detailed,
      });
    }
  }

  const randomDurationMs = randomComments.length > 0 ? performance.now() - randomStarted : 0;
  const memoryEndMb = readMemoryMb();

  for (const entry of evaluatedHardCases) {
    if (entry.analysis) {
      increment(rootCauseDistribution, entry.analysis.rootCause);
    }
  }

  const allLatencyRecords = [
    ...randomLatencies.map((latencyMs, index) => ({
      id: `random-${index + 1}`,
      comment: randomComments[index],
      latencyMs,
      group: "R-random",
    })),
    ...evaluatedHardCases.map((entry) => ({
      id: entry.id,
      comment: entry.comment,
      latencyMs: entry.latencyMs,
      group: entry.group,
    })),
  ];

  const allLatencies = allLatencyRecords.map((entry) => entry.latencyMs);
  const deterministicDurationMs = evaluatedHardCases.reduce((sum, entry) => sum + entry.latencyMs, 0);
  const totalDurationMs = randomDurationMs + deterministicDurationMs;
  const totalProcessed = randomComments.length + evaluatedHardCases.length;

  const passCount = evaluatedHardCases.filter((entry) => entry.status === "PASS").length;
  const failCount = evaluatedHardCases.filter((entry) => entry.status === "FAIL").length;
  const warnCount = evaluatedHardCases.filter((entry) => entry.status === "WARN").length;
  const skipCount = evaluatedHardCases.filter((entry) => entry.status === "SKIP").length;

  const deterministicIssues = evaluatedHardCases
    .filter((entry) => entry.status === "FAIL" || entry.status === "WARN" || entry.status === "SKIP")
    .map((entry) => entry.detailed);
  const randomIssues = randomEvaluated.map((entry) => entry.detailed);
  const topIssues = [...deterministicIssues, ...randomIssues].slice(0, 20);
  const topSlowest = [...allLatencyRecords]
    .sort((left, right) => right.latencyMs - left.latencyMs)
    .slice(0, 20);

  const topProducts = Object.entries(productQuestionCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 10)
    .map(([productId, count]) => ({
      productId,
      productName: runtime.findProduct(runtime.catalog, productId).name,
      count,
    }));

  const retrainCandidates = [
    ...evaluatedHardCases
      .filter((entry) => entry.status === "FAIL" || entry.status === "WARN" || entry.status === "SKIP")
      .map(toRetrainCandidate)
      .filter((entry): entry is RetrainCandidate => entry !== null),
    ...randomEvaluated.map(toRetrainCandidate).filter((entry): entry is RetrainCandidate => entry !== null),
  ];

  const detailedRecords: DetailedCaseRecord[] = [
    ...evaluatedHardCases.map((entry) => entry.detailed),
    ...randomEvaluated.map((entry) => entry.detailed),
  ];

  console.log("=== Sales NLP Load Test ===");
  console.log(`Catalog mode: ${cli.catalogMode}`);
  console.log(`Run context mode: ${cli.runContextMode}`);
  console.log(`Pinned fallback disabled: ${runtime.disablePinnedFallback ? "yes" : "no"}`);
  console.log(`Catalog products: ${runtime.catalog.length}`);
  console.log(`Deterministic cases: ${evaluatedHardCases.length}`);
  console.log(`Random comments: ${randomComments.length}`);
  console.log(`Seed: ${cli.seed}`);
  if (cli.groupFilter) {
    console.log(`Group filter: ${cli.groupFilter}`);
  }
  console.log(`Total processed: ${totalProcessed}`);

  if (!cli.verbose && !cli.onlyFailures) {
    for (const entry of evaluatedHardCases) {
      if (entry.status === "PASS" || entry.status === "FAIL" || entry.status === "WARN") {
        console.log(formatCompactLine(entry));
      }
    }
  }

  for (const entry of evaluatedHardCases) {
    if (cli.verbose) {
      printVerboseDeterministicCase(entry.detailed);
    } else if (shouldPrintDetailed(entry, cli)) {
      printDetailedFailure(entry.detailed);
    }
  }

  if (cli.onlyFailures) {
    for (const entry of randomEvaluated) {
      printDetailedFailure(entry.detailed);
    }
  }

  const avgLatency =
    allLatencies.length > 0 ? allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length : 0;
  const p50Latency = percentile(allLatencies, 0.5);
  const p95Latency = percentile(allLatencies, 0.95);
  const p99Latency = percentile(allLatencies, 0.99);
  const maxLatency = allLatencies.length > 0 ? Math.max(...allLatencies) : 0;
  const throughput = totalDurationMs > 0 ? totalProcessed / (totalDurationMs / 1000) : 0;
  const memoryDelta =
    memoryStartMb !== null && memoryEndMb !== null ? memoryEndMb - memoryStartMb : null;

  mkdirSync(reportsDir, { recursive: true });
  const reportPath = join(reportsDir, "sales-nlp-loadtest-report.json");
  const csvPath = join(reportsDir, "sales-nlp-loadtest-cases.csv");
  const detailedJsonlPath = join(reportsDir, "sales-nlp-loadtest-detailed-cases.jsonl");
  const retrainJsonlPath = join(reportsDir, "sales-nlp-retrain-candidates.jsonl");
  const retrainCsvPath = join(reportsDir, "sales-nlp-retrain-candidates.csv");

  const report = {
    meta: {
      generatedAt: new Date().toISOString(),
      productCount: cli.products,
      randomCommentCount: cli.comments,
      seed: cli.seed,
      iterations: cli.iterations,
      strictRandom: cli.strictRandom,
      verbose: cli.verbose,
      onlyFailures: cli.onlyFailures,
      groupFilter: cli.groupFilter,
      catalogMode: cli.catalogMode,
      runContextMode: cli.runContextMode,
      disablePinnedFallback: runtime.disablePinnedFallback,
      productUnderstanding: productMetrics,
      pinnedFallbackAudit: PINNED_FALLBACK_AUDIT,
      totalProcessed,
      totalDurationMs,
      commentsPerSecond: throughput,
      averageLatencyMs: avgLatency,
      p50LatencyMs: p50Latency,
      p95LatencyMs: p95Latency,
      p99LatencyMs: p99Latency,
      maxLatencyMs: maxLatency,
      memoryStartMb,
      memoryEndMb,
      memoryDeltaMb: memoryDelta,
      passCount,
      failCount,
      warnCount,
      skipCount,
      randomSuspiciousFailCount: randomFailCount,
      randomSuspiciousWarnCount: randomWarnCount,
      retrainCandidateCount: retrainCandidates.length,
    },
    distributions: {
      intent: intentDistribution,
      action: actionDistribution,
      contextSource: contextDistribution,
      rootCause: rootCauseDistribution,
    },
    randomSummary: {
      clarificationCount,
      unresolvedCount,
      topProducts,
    },
    topSlowest,
    topIssues,
    deterministicCases: evaluatedHardCases.map((entry) => entry.detailed),
    randomSuspiciousCases: randomEvaluated.map((entry) => entry.detailed),
    retrainCandidates,
  };

  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  const csvHeader = [
    "id",
    "group",
    "comment",
    "contextLabel",
    "scenario",
    "status",
    "latencyMs",
    "intent",
    "contextSource",
    "resolvedProductId",
    "action",
    "rootCause",
    "suggestedFix",
    "explanationSummary",
    "messages",
  ].join(",");

  const csvRows = evaluatedHardCases.map((entry) =>
    [
      entry.id,
      entry.group,
      escapeCsv(entry.comment),
      entry.contextLabel,
      entry.scenario ?? "",
      entry.status,
      entry.latencyMs.toFixed(3),
      entry.result.explanation.intent,
      entry.result.explanation.contextSource,
      entry.result.explanation.resolvedProductId,
      entry.result.explanation.action,
      entry.analysis?.rootCause ?? "",
      escapeCsv(entry.analysis?.suggestedFix ?? ""),
      escapeCsv(buildExplanationSummary(entry.result.explanation)),
      escapeCsv(entry.messages.join("; ")),
    ].join(","),
  );

  writeFileSync(csvPath, [csvHeader, ...csvRows].join("\n"), "utf8");
  writeFileSync(detailedJsonlPath, detailedRecords.map((record) => JSON.stringify(record)).join("\n"), "utf8");
  writeFileSync(
    retrainJsonlPath,
    retrainCandidates.map((entry) => JSON.stringify(entry)).join("\n"),
    "utf8",
  );

  const retrainCsvHeader = [
    "text",
    "expectedIntent",
    "actualIntent",
    "expectedProduct",
    "actualProduct",
    "expectedContextSource",
    "actualContextSource",
    "rootCause",
    "suggestedFix",
    "normalizedText",
    "sourceGroup",
    "severity",
    "status",
  ].join(",");

  const retrainCsvRows = retrainCandidates.map((entry) =>
    [
      escapeCsv(entry.text),
      entry.expectedIntent ?? "",
      entry.actualIntent,
      entry.expectedProduct ?? "",
      entry.actualProduct,
      entry.expectedContextSource ?? "",
      entry.actualContextSource,
      entry.rootCause,
      escapeCsv(entry.suggestedFix),
      escapeCsv(entry.normalizedText),
      entry.sourceGroup,
      entry.severity,
      entry.status,
    ].join(","),
  );

  writeFileSync(retrainCsvPath, [retrainCsvHeader, ...retrainCsvRows].join("\n"), "utf8");

  if (cli.groupFilter === "lipstick" || runtime.disablePinnedFallback) {
    printProductUnderstandingReport(productMetrics, runtime.disablePinnedFallback);
  }

  printFinalSummary({
    passCount,
    failCount,
    warnCount,
    skipCount,
    randomProcessed: randomComments.length,
    randomSuspiciousFail: randomFailCount,
    randomSuspiciousWarn: randomWarnCount,
    avgLatency,
    p50Latency,
    p95Latency,
    p99Latency,
    maxLatency,
    throughput,
    memoryDelta,
    memoryEndMb,
    intentDistribution,
    contextDistribution,
    actionDistribution,
    rootCauseDistribution,
    retrainCandidateCount: retrainCandidates.length,
    reportPaths: [reportPath, csvPath, detailedJsonlPath, retrainJsonlPath, retrainCsvPath],
    topProducts,
    topIssues,
    topSlowest,
  });

  const shouldFailRandom = cli.strictRandom && (randomFailCount > 0 || randomWarnCount > 0);
  if (failCount > 0 || shouldFailRandom) {
    process.exitCode = 1;
  }
}

main();
