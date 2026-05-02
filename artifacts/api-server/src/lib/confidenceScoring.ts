import type { EntityExtractionOutput } from "./agentSchemas";

// ─── Rubric definition ────────────────────────────────────────────────────────

export const RUBRIC_WEIGHTS = {
  environment:         20,
  frequency:           15,
  stack_trace:         25,
  expected_behavior:   15,
  similar_bug:         20,
  code_snippet:        10,
  reproduction_steps:  15,
} as const;

export const RUBRIC_MAX = 120; // raw max before capping at 100
export const RUBRIC_CAP = 100;

export const RUBRIC_LABELS: Record<keyof typeof RUBRIC_WEIGHTS, string> = {
  environment:        "Environment specified (browser, OS, runtime)",
  frequency:          "Failure frequency known (always / intermittent / rare)",
  stack_trace:        "Stack trace or error trace present",
  expected_behavior:  "Expected behavior clearly stated",
  similar_bug:        "Similar historical bug found in database",
  code_snippet:       "Code snippet or context provided",
  reproduction_steps: "Partial reproduction steps given by user",
};

export const RUBRIC_DESCRIPTIONS: Record<keyof typeof RUBRIC_WEIGHTS, { pass: string; fail: string }> = {
  environment: {
    pass: "OS, browser, runtime, or version detected",
    fail: "No environment details provided — OS, browser, runtime, or version needed",
  },
  frequency: {
    pass: "Reproduction frequency explicitly stated",
    fail: "Frequency unknown — specify if this happens always, intermittently, or rarely",
  },
  stack_trace: {
    pass: "Stack trace or exception trace found in input",
    fail: "No stack trace — adding one narrows the root cause significantly",
  },
  expected_behavior: {
    pass: "Expected outcome clearly stated",
    fail: "Expected behavior too vague — describe what should have happened in detail",
  },
  similar_bug: {
    pass: "Matching or related bug found in historical database",
    fail: "No similar bugs in history — first occurrence or database is empty",
  },
  code_snippet: {
    pass: "Code context or snippet attached",
    fail: "No code provided — attaching the relevant function or component helps",
  },
  reproduction_steps: {
    pass: "Step-by-step reproduction instructions detected",
    fail: "No reproduction steps in report — numbered steps would improve accuracy",
  },
};

// ─── Scoring output type ──────────────────────────────────────────────────────

export type ConfidenceRubric = {
  environment: number;
  frequency: number;
  stack_trace: number;
  expected_behavior: number;
  similar_bug: number;
  code_snippet: number;
  reproduction_steps: number;
};

export type ScoredConfidence = {
  score: number;
  rubric: ConfidenceRubric;
  missing: string[];
};

// ─── Detection helpers ────────────────────────────────────────────────────────

// Patterns that identify a stack trace is present (any format)
const STACK_TRACE_PATTERNS = [
  /at\s+[\w$./<>]+\s*\(.*:\d+:\d+\)/m,        // JS/Node.js: at fn (file:line:col)
  /at\s+[\w$./<>]+\s+\(.*\)/m,                 // JS: at fn (file)
  /Traceback \(most recent call last\):/m,       // Python
  /\s+File ".*", line \d+, in /m,               // Python traceback line
  /Exception in thread "main"/m,                 // Java
  /\s+at [\w$.]+\.[\w$]+\([\w$]+\.java:\d+\)/m, // Java stack
  /panic:/m,                                     // Go panic
  /goroutine \d+ \[/m,                          // Go goroutine dump
  /\.rb:\d+:in `/m,                             // Ruby
  /\#\d+ .+ in .+\(.+\)/m,                     // C++ backtrace
  /caused by:/im,                               // Chained exception
];

// Patterns that indicate the trace is MINIFIED — reproducibility value is lower.
// A minified trace typically has:
//   • A hashed/fingerprinted filename  (e.g. main.abc12.js)
//   • A very large column number       (e.g. :1:4521)
//   • Single-letter or mangled fn names (e.g. "at t.<anonymous>")
const MINIFIED_TRACE_PATTERNS = [
  /\.[a-f0-9]{4,}\.(js|mjs|cjs):\d+:\d{3,}/i,          // bundle.a1b2c.js:1:4521
  /\bchunk[.\-][a-zA-Z0-9]{4,}\.(js|mjs):\d+:\d+/i,    // chunk.abc12.js:1:234
  /\([\w.\-\/]+\.[a-f0-9]{4,}\.js:\d+:\d{3,}\)/,        // (app.f9e8d.js:1:4521)
  /at\s+[a-z]\s+\(/,                                    // at a (, at t.< — single-letter fn
];

const CODE_PATTERNS = [
  /```[\s\S]+?```/,                              // Any code fence
  /function\s+\w+\s*\(/,                        // JS function
  /const\s+\w+\s*=\s*(?:async\s*)?\(/,          // Arrow function
  /def\s+\w+\s*\(/,                             // Python function
  /class\s+\w+\s*[\w({]/,                       // Class definition
  /\bimport\s+\w+\s+from\s+['"`]/,              // ES import
  /\bfrom\s+\w+\s+import\b/,                    // Python import
  /\bexport\s+(?:default\s+)?(?:function|class|const)\b/, // JS export
];

const STEP_PATTERNS = [
  /(?:^|\n)\s*(?:\d+[.)]\s+|[-*]\s+(?:(?:click|press|open|go to|navigate|enter|type|submit|select|scroll|wait)\b))/im,
  /steps?\s+to\s+reproduce/i,
  /to\s+reproduce/i,
  /repro\s+steps/i,
  /(?:^|\n)\s*1[.)]\s+/m,                       // Starts with "1." or "1)"
];

// ─── Main scoring function ────────────────────────────────────────────────────
//
// Deterministic — no LLM calls. Given the extracted entities + raw input signals,
// awards points per rubric factor. Sum is capped at 100.

export function calculateConfidenceScore(
  entityData: EntityExtractionOutput,
  rawInput: string,
  codeContext: string | null | undefined,
  hasSimilarBugs: boolean
): ScoredConfidence {
  const rubric: ConfidenceRubric = {
    environment:        0,
    frequency:          0,
    stack_trace:        0,
    expected_behavior:  0,
    similar_bug:        0,
    code_snippet:       0,
    reproduction_steps: 0,
  };

  // ── Environment (+20) ─────────────────────────────────────────────────────
  const env = entityData.environment ?? {};
  const hasEnv =
    (env.os && env.os.trim().length > 0) ||
    (env.browser && env.browser.trim().length > 0) ||
    (env.runtime && env.runtime.trim().length > 0) ||
    (env.version && env.version.trim().length > 0) ||
    (env.other && env.other.trim().length > 0);
  if (hasEnv) rubric.environment = RUBRIC_WEIGHTS.environment;

  // ── Frequency (+15) ───────────────────────────────────────────────────────
  if (entityData.frequency && entityData.frequency !== "unknown") {
    rubric.frequency = RUBRIC_WEIGHTS.frequency;
  }

  // ── Stack trace (+10 minified / +25 readable) ────────────────────────────
  // Minified traces (hashed filenames, 4-digit+ column numbers, single-letter
  // function names) are detected and awarded only +10 — they confirm a trace
  // exists but provide far less reproduction value than a readable trace.
  const allTraceText = [rawInput, ...entityData.errorMessages].join("\n");
  const hasStackTrace = STACK_TRACE_PATTERNS.some((p) => p.test(allTraceText));
  if (hasStackTrace) {
    const isMinified = MINIFIED_TRACE_PATTERNS.some((p) => p.test(allTraceText));
    rubric.stack_trace = isMinified ? 10 : RUBRIC_WEIGHTS.stack_trace;
  }

  // ── Expected behavior (+15) ───────────────────────────────────────────────
  // Must be substantive — more than just a single word or filler phrase
  const expectedTrimmed = entityData.expectedBehavior?.trim() ?? "";
  const isSubstantive =
    expectedTrimmed.length >= 15 &&
    !/^(nothing|n\/a|not sure|unknown|no error|works|success)$/i.test(expectedTrimmed);
  if (isSubstantive) rubric.expected_behavior = RUBRIC_WEIGHTS.expected_behavior;

  // ── Similar bug (+20) ─────────────────────────────────────────────────────
  if (hasSimilarBugs) rubric.similar_bug = RUBRIC_WEIGHTS.similar_bug;

  // ── Code snippet (+10) ────────────────────────────────────────────────────
  const hasCode =
    (codeContext != null && codeContext.trim().length > 10) ||
    CODE_PATTERNS.some((p) => p.test(rawInput));
  if (hasCode) rubric.code_snippet = RUBRIC_WEIGHTS.code_snippet;

  // ── Reproduction steps (+15) ──────────────────────────────────────────────
  const hasSteps = STEP_PATTERNS.some((p) => p.test(rawInput));
  if (hasSteps) rubric.reproduction_steps = RUBRIC_WEIGHTS.reproduction_steps;

  // ── Final score (cap at 100) ──────────────────────────────────────────────
  const rawTotal = Object.values(rubric).reduce((a, b) => a + b, 0);
  const score = Math.min(RUBRIC_CAP, rawTotal);

  const missing = (Object.keys(rubric) as (keyof ConfidenceRubric)[])
    .filter((k) => rubric[k] === 0)
    .map((k) => RUBRIC_LABELS[k]);

  return { score, rubric, missing };
}
