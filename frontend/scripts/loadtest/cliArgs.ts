import { PRODUCT_COUNT, RANDOM_COMMENT_COUNT, SEED } from "../fixtures/generateDummyCatalog";

/** Single-case --context (legacy) */
export type LoadTestContextMode =
  | "pinned"
  | "no-context"
  | "manual-camera"
  | "vision-enabled"
  | "vision-disabled";

/** Batch run context for product-understanding audits */
export type LoadTestRunContextMode = "no-pin" | "pinned" | "manual" | "mixed";

export type LoadTestCatalogMode = "default" | "lipstick-heavy";

export type LoadTestCliOptions = {
  products: number;
  comments: number;
  seed: number;
  strictRandom: boolean;
  iterations: number;
  verbose: boolean;
  onlyFailures: boolean;
  explain: boolean;
  caseComment: string | null;
  contextMode: LoadTestContextMode;
  runContextMode: LoadTestRunContextMode;
  disablePinnedFallback: boolean;
  catalogMode: LoadTestCatalogMode;
  productId: string | null;
  cameraProductId: string | null;
  visionConfidence: number | null;
  groupFilter: string | null;
};

function readPositiveInt(argv: string[], index: number, flag: string): number | null {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    console.error(`Missing value for ${flag}`);
    process.exit(1);
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.error(`Invalid numeric value for ${flag}: ${value}`);
    process.exit(1);
  }
  return parsed;
}

function readNonNegativeInt(argv: string[], index: number, flag: string): number | null {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    console.error(`Missing value for ${flag}`);
    process.exit(1);
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    console.error(`Invalid numeric value for ${flag}: ${value}`);
    process.exit(1);
  }
  return parsed;
}

function readString(argv: string[], index: number, flag: string): string | null {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    console.error(`Missing value for ${flag}`);
    process.exit(1);
  }
  return value;
}

function readFloat(argv: string[], index: number, flag: string): number | null {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    console.error(`Missing value for ${flag}`);
    process.exit(1);
  }
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    console.error(`Invalid numeric value for ${flag}: ${value}`);
    process.exit(1);
  }
  return parsed;
}

function parseContextMode(value: string): LoadTestContextMode {
  const normalized = value.toLowerCase();
  const allowed: LoadTestContextMode[] = [
    "pinned",
    "no-context",
    "manual-camera",
    "vision-enabled",
    "vision-disabled",
  ];
  if (!allowed.includes(normalized as LoadTestContextMode)) {
    console.error(`Invalid --context value: ${value}. Allowed: ${allowed.join(", ")}`);
    process.exit(1);
  }
  return normalized as LoadTestContextMode;
}

function parseRunContextMode(value: string): LoadTestRunContextMode {
  const normalized = value.toLowerCase();
  const allowed: LoadTestRunContextMode[] = ["no-pin", "pinned", "manual", "mixed"];
  if (!allowed.includes(normalized as LoadTestRunContextMode)) {
    console.error(`Invalid --context-mode value: ${value}. Allowed: ${allowed.join(", ")}`);
    process.exit(1);
  }
  return normalized as LoadTestRunContextMode;
}

function parseCatalogMode(value: string): LoadTestCatalogMode {
  const normalized = value.toLowerCase();
  if (normalized === "lipstick-heavy" || normalized === "lipstick") {
    return "lipstick-heavy";
  }
  if (normalized === "default") {
    return "default";
  }
  console.error(`Invalid --catalog value: ${value}. Allowed: default, lipstick-heavy`);
  process.exit(1);
}

export function printLoadTestHelp() {
  console.log(`Usage: npm run test:sales-nlp-load -- [options]

Options:
  --products <n>              Catalog size (default: ${PRODUCT_COUNT})
  --comments <n>              Random stress comments (default: ${RANDOM_COMMENT_COUNT}, 0 = skip)
  --seed <n>                  Deterministic seed (default: ${SEED})
  --catalog <mode>            default | lipstick-heavy
  --context-mode <mode>       no-pin | pinned | manual | mixed (batch run context)
  --disable-pinned-fallback   Force __no_pin__ product id (same as --context-mode no-pin)
  --strict-random             Fail on random WARN/FAIL too
  --verbose                   Print full explanation for every deterministic case
  --only-failures             Print full explanation only for FAIL/WARN/SKIP/suspicious
  --group <name>              Filter cases (lipstick, deictic, ambiguity, stock, ...)
  --case "<comment>"          Run one ad-hoc comment (use with --explain)
  --context <mode>            Single-case: pinned | no-context | manual-camera | ...
  --product <id>              Pinned product id
  --camera-product <id>       Manual/vision camera product id
  --vision-confidence <n>     Vision confidence threshold input
  --explain                   Human-readable single-case explanation output
  --help                      Show this help

Examples:
  npm run test:sales-nlp-load -- --context-mode no-pin --group lipstick --verbose --comments 0
  npm run test:sales-nlp-load -- --context-mode no-pin --catalog lipstick-heavy --only-failures --comments 10000
  npm run test:sales-nlp-load -- --case "son ruby giá sao" --context no-context --catalog lipstick-heavy --explain
`);
}

export function parseLoadTestCliArgs(argv: string[] = process.argv.slice(2)): LoadTestCliOptions {
  const options: LoadTestCliOptions = {
    products: PRODUCT_COUNT,
    comments: RANDOM_COMMENT_COUNT,
    seed: SEED,
    strictRandom: false,
    iterations: 1,
    verbose: false,
    onlyFailures: false,
    explain: false,
    caseComment: null,
    contextMode: "pinned",
    runContextMode: "pinned",
    disablePinnedFallback: false,
    catalogMode: "default",
    productId: null,
    cameraProductId: null,
    visionConfidence: null,
    groupFilter: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    switch (token) {
      case "--products":
        options.products = readPositiveInt(argv, index, token) ?? options.products;
        index += 1;
        break;
      case "--comments":
        options.comments = readNonNegativeInt(argv, index, token) ?? options.comments;
        index += 1;
        break;
      case "--seed":
        options.seed = readPositiveInt(argv, index, token) ?? options.seed;
        index += 1;
        break;
      case "--iterations":
        options.iterations = readPositiveInt(argv, index, token) ?? options.iterations;
        index += 1;
        break;
      case "--case":
        options.caseComment = readString(argv, index, token);
        index += 1;
        break;
      case "--context":
        options.contextMode = parseContextMode(readString(argv, index, token) ?? "pinned");
        index += 1;
        break;
      case "--context-mode":
        options.runContextMode = parseRunContextMode(readString(argv, index, token) ?? "pinned");
        if (options.runContextMode === "no-pin") {
          options.disablePinnedFallback = true;
        }
        index += 1;
        break;
      case "--disable-pinned-fallback":
        options.disablePinnedFallback = true;
        options.runContextMode = "no-pin";
        break;
      case "--catalog":
        options.catalogMode = parseCatalogMode(readString(argv, index, token) ?? "default");
        index += 1;
        break;
      case "--product":
        options.productId = readString(argv, index, token);
        index += 1;
        break;
      case "--camera-product":
        options.cameraProductId = readString(argv, index, token);
        index += 1;
        break;
      case "--vision-confidence":
        options.visionConfidence = readFloat(argv, index, token);
        index += 1;
        break;
      case "--group":
        options.groupFilter = readString(argv, index, token)?.toLowerCase() ?? null;
        if (options.groupFilter === "lipstick") {
          options.catalogMode = "lipstick-heavy";
        }
        index += 1;
        break;
      case "--strict-random":
        options.strictRandom = true;
        break;
      case "--verbose":
        options.verbose = true;
        break;
      case "--only-failures":
        options.onlyFailures = true;
        break;
      case "--explain":
        options.explain = true;
        break;
      case "--help":
      case "-h":
        printLoadTestHelp();
        process.exit(0);
        break;
      default:
        if (token.startsWith("--")) {
          console.warn(`Unknown flag ignored: ${token}`);
        }
        break;
    }
  }

  return options;
}
