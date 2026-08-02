import { getActiveClient, getActiveModel } from "./llmConfig";
import { logger } from "./logger";
import {
  EntityExtractionSchema,
  HypothesesSchema,
  StepValidationSchema,
  TestWriterSchema,
  SynthesizerSchema,
  AgentValidationError,
  AgentTimeoutError,
  safeParseStructured,
  formatZodErrors,
  ENTITY_SCHEMA_HINT,
  HYPOTHESES_SCHEMA_HINT,
  STEPS_SCHEMA_HINT,
  TEST_SCHEMA_HINT,
  SYNTHESIZER_SCHEMA_HINT,
  FIX_SUGGESTER_SCHEMA_HINT,
  FixSuggesterSchema,
  type EntityExtractionOutput,
  type HypothesesOutput,
  type StepValidationOutput,
  type TestWriterOutput,
  type SynthesizerOutput,
  type FixSuggesterOutput,
} from "./agentSchemas";
import {
  calculateConfidenceScore,
  RUBRIC_WEIGHTS,
  RUBRIC_LABELS,
  type ScoredConfidence,
} from "./confidenceScoring";
import { generateMermaidFromDiagram } from "./diagramGenerator";
import {
  validateTestCode,
  type TestSyntaxStatus,
} from "./syntaxValidator";
import type { ZodSchema } from "zod";

// ─── Public types ─────────────────────────────────────────────────────────────

export type AgentEvent = {
  type:
    | "agent_start"
    | "agent_output"
    | "agent_done"
    | "agent_validated"
    | "agent_retry"
    | "pipeline_done"
    | "error"
    | "rate_limit"
    | "timeout";
  agentName: string;
  content: string;
};

export type AuditDetail = {
  label: string;
  value: string;
  status?: "ok" | "warn" | "info" | "error";
};

export type AuditEntry = {
  timestamp: string;
  agent: string;
  action: string;
  decision: string;
  rationale: string;
  durationMs?: number;
  details?: AuditDetail[];
};

export type ConfidenceBreakdown = {
  score: number;
  rubric: Record<string, number>;
  missing: string[];
  evidence: string[];
  assumptions: string[];
};

export type PipelineResult = {
  extractedEntities: string;
  hypotheses: string;
  reproductionSteps: string;
  testCode: string;
  testSyntaxStatus: TestSyntaxStatus;
  flowDiagram: string;
  clarifyingQuestions: string;
  confidenceScore: number;
  confidenceBreakdown: ConfidenceBreakdown;
  severity: "critical" | "high" | "medium" | "low";
  severityReason: string;
  auditTrail: AuditEntry[];
  fixSuggestions: string;
  autoTags: string;
};

// ─── Source-type metadata ─────────────────────────────────────────────────────

const SOURCE_TYPE_LABELS: Record<string, string> = {
  raw_text: "raw bug report",
  github_url: "GitHub issue",
  stack_trace: "stack trace",
  jira_ticket: "Jira ticket",
  sentry_event: "Sentry error event",
  log_file: "log file output",
  curl_request: "failed curl/API request",
  video_description: "video/screen recording description",
  screenshot: "screenshot or visual bug",
  performance_profile: "performance profile or profiler output",
};

const SOURCE_TYPE_HINTS: Record<string, string> = {
  stack_trace:
    "Pay special attention to: the error type, the exact line numbers, the call chain from top to bottom, and any chained causes. Trace the execution path carefully.",
  github_url:
    "This is a GitHub issue — extract the title, description, steps to reproduce if listed, labels, and any key comments that add context.",
  jira_ticket:
    "This is a Jira ticket — extract the issue type, priority, environment fields, acceptance criteria, and any linked issues or comments.",
  sentry_event:
    "This is a Sentry error event — focus on: exception type/message, the stack trace, breadcrumbs, device/browser context, release version, and any tags.",
  log_file:
    "This is a log file — identify: the error pattern, timestamps around the failure, repeated error sequences, and the sequence of events leading up to the failure.",
  curl_request:
    "This is a failed API/curl request — note: the endpoint, HTTP method, headers, request body, response status code, response body, and any authentication indicators.",
  video_description:
    "This is a description of a recorded bug — focus on: the visual sequence of actions, the exact moment of failure, UI state changes, and any error messages visible.",
  screenshot:
    "This is a description of a screenshot — extract all visible error messages, status codes, UI state, and any stack traces or exception text visible on screen.",
  performance_profile:
    "This is a performance profile or profiler output — identify the slowest operations, memory hotspots, CPU bottlenecks, and the specific function calls causing performance degradation.",
  raw_text: "",
};

// ─── Low-level agent runner (single LLM call, streaming) ─────────────────────
//
// Handles three failure classes transparently before bubbling up:
//   1. Rate limit (429)  → emit rate_limit event, wait retry-after, retry once more
//   2. First timeout     → emit timeout event, wait 10 s, retry once
//   3. Second timeout    → throw AgentTimeoutError (caught by route handler)
//
// Max LLM retries from this function: 4 (3 rate-limit retries + 1 timeout retry)

const AGENT_TIMEOUT_MS = 45_000;
const MAX_RATE_LIMIT_RETRIES = 3;

async function runAgent(
  agentName: string,
  systemPrompt: string,
  userPrompt: string,
  onEvent: (event: AgentEvent) => void,
  _attempt = 1,
  _timeoutAttempts = 0
): Promise<{ content: string; duration: number }> {
  if (_attempt === 1 && _timeoutAttempts === 0) {
    onEvent({ type: "agent_start", agentName, content: `Starting ${agentName}...` });
  }

  const startTime = Date.now();
  let fullContent = "";

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS);

  try {
    const stream = await getActiveClient().chat.completions.create(
      {
        model: getActiveModel(),
        max_completion_tokens: 8192,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: true,
      },
      { signal: controller.signal }
    );

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        fullContent += delta;
        onEvent({ type: "agent_output", agentName, content: delta });
      }
    }

    clearTimeout(timeoutHandle);
    const duration = Date.now() - startTime;
    onEvent({ type: "agent_done", agentName, content: `${agentName} complete.` });
    return { content: fullContent, duration };
  } catch (err) {
    clearTimeout(timeoutHandle);

    // ── Rate limit (429) ──────────────────────────────────────────────────────
    const httpStatus = (err as { status?: number })?.status;
    if (httpStatus === 429) {
      if (_attempt <= MAX_RATE_LIMIT_RETRIES) {
        const retryAfterHeader = (err as { headers?: Record<string, string> })?.headers?.["retry-after"];
        const retryAfterSec = retryAfterHeader ? Math.min(parseInt(retryAfterHeader, 10), 120) : 30;
        onEvent({ type: "rate_limit", agentName, content: String(retryAfterSec) });
        await new Promise<void>(resolve => setTimeout(resolve, retryAfterSec * 1000));
        return runAgent(agentName, systemPrompt, userPrompt, onEvent, _attempt + 1, _timeoutAttempts);
      }
      // Exhausted retries — let it bubble as a standard error
      throw err;
    }

    // ── Timeout (AbortController fired) ──────────────────────────────────────
    if (controller.signal.aborted || (err instanceof Error && err.name === "AbortError")) {
      if (_timeoutAttempts === 0) {
        onEvent({
          type: "timeout",
          agentName,
          content: `${agentName} is taking longer than expected. Retrying in 10 seconds...`,
        });
        await new Promise<void>(resolve => setTimeout(resolve, 10_000));
        onEvent({ type: "agent_start", agentName, content: `Retrying ${agentName}...` });
        return runAgent(agentName, systemPrompt, userPrompt, onEvent, _attempt, 1);
      }
      // Second timeout — give up on this agent
      throw new AgentTimeoutError(agentName);
    }

    throw err;
  }
}

// ─── Validated agent runner ───────────────────────────────────────────────────
//
// Wraps runAgent with Zod schema enforcement:
//   1. Call runAgent → parse + validate output
//   2. On failure: emit agent_retry, call runAgent again with an error-correction prompt
//   3. On second failure: throw AgentValidationError({ agent, reason, rawOutput })
//   4. On success (either attempt): emit agent_validated
//
// Downstream agents NEVER start if this function throws.

async function runValidatedAgent<T>(
  agentName: string,
  schema: ZodSchema<T>,
  systemPrompt: string,
  userPrompt: string,
  onEvent: (event: AgentEvent) => void
): Promise<T> {
  // ── Attempt 1 ────────────────────────────────────────────────────────────
  const { content: raw1 } = await runAgent(agentName, systemPrompt, userPrompt, onEvent);

  const result1 = safeParseStructured(schema, raw1);
  if (result1.success) {
    onEvent({ type: "agent_validated", agentName, content: "" });
    return result1.data;
  }

  // ── Validation failed — build correction prompt and retry once ────────────
  const errorDesc = formatZodErrors(result1.error);
  onEvent({ type: "agent_retry", agentName, content: errorDesc });

  const correctionPrompt = `Your previous response failed JSON schema validation.

VALIDATION ERRORS (fix ALL of them):
${errorDesc}

YOUR PREVIOUS OUTPUT (first 800 chars):
${raw1.slice(0, 800)}

INSTRUCTIONS:
- Respond ONLY with a valid JSON object or array
- Do NOT wrap in markdown code fences
- Do NOT add any explanation before or after the JSON
- Every required field listed in the original schema must be present and correctly typed`;

  // ── Attempt 2 ────────────────────────────────────────────────────────────
  const { content: raw2 } = await runAgent(
    `${agentName} [correction]`,
    systemPrompt,
    correctionPrompt,
    onEvent
  );

  const result2 = safeParseStructured(schema, raw2);
  if (result2.success) {
    onEvent({ type: "agent_validated", agentName, content: "corrected" });
    return result2.data;
  }

  // ── Both attempts failed — structured error, no downstream execution ──────
  throw new AgentValidationError({
    agent: agentName,
    reason: formatZodErrors(result2.error),
    rawOutput: raw2,
    attempt: 2,
  });
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

export async function runBugReproductionPipeline(
  rawInput: string,
  inputType: string,
  codeContext: string | null | undefined,
  onEvent: (event: AgentEvent) => void,
  hasSimilarBugs = false,
  frameworkHint?: string
): Promise<PipelineResult> {
  const sourceLabel = SOURCE_TYPE_LABELS[inputType] ?? "bug report";
  const sourceHint = SOURCE_TYPE_HINTS[inputType] ?? "";
  const context = codeContext
    ? `\n\nRelevant code context:\n\`\`\`\n${codeContext}\n\`\`\``
    : "";
  const auditTrail: AuditEntry[] = [];
  const pipelineStartMs = Date.now();
  const fmtMs = (ms: number) =>
    ms < 1000 ? `${ms}ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;

  // ── Agent 1: Entity Extraction ────────────────────────────────────────────
  const t0_entity = Date.now();
  const entityData: EntityExtractionOutput = await runValidatedAgent(
    "Entity Extraction Agent",
    EntityExtractionSchema,
    `You are an expert bug analysis AI specializing in ${sourceLabel} analysis.
${sourceHint}

Extract structured bug information from the provided ${sourceLabel}.

CRITICAL: Respond ONLY with a valid JSON object. No markdown. No explanation. No code fences.
Use this exact schema (all required fields must be present):
${ENTITY_SCHEMA_HINT}

Rules:
- component: the specific module, endpoint, class, or file affected
- triggerAction: the exact action or sequence of events that triggers the bug
- expectedBehavior: what should happen according to the spec or user expectation
- actualBehavior: what actually happens (the failure, error, or wrong outcome)
- frequency: choose one of "always", "intermittent", "rare", or "unknown"
- errorMessages: include verbatim error text if present, otherwise empty array []`,
    `${sourceLabel.charAt(0).toUpperCase() + sourceLabel.slice(1)} content:\n${rawInput}${context}`,
    onEvent
  );

  const entityMs = Date.now() - t0_entity;
  auditTrail.push({
    timestamp: new Date().toISOString(),
    agent: "Entity Extraction Agent",
    action: "extracted_entities",
    durationMs: entityMs,
    decision: `Extracted entities: component="${entityData.component}", trigger="${entityData.triggerAction}", frequency=${entityData.frequency}, ${entityData.errorMessages.length} error message(s)`,
    rationale: `Processed ${sourceLabel} to identify all key debugging signals. Entity schema validated before passing to Hypothesis Generator.`,
    details: [
      { label: "Component", value: entityData.component, status: "ok" },
      { label: "Trigger action", value: entityData.triggerAction, status: "ok" },
      { label: "Expected behavior", value: entityData.expectedBehavior, status: "ok" },
      { label: "Actual behavior (bug)", value: entityData.actualBehavior, status: "error" },
      { label: "Frequency", value: entityData.frequency, status: "info" },
      {
        label: "Error messages",
        value: entityData.errorMessages.length > 0 ? entityData.errorMessages.join(" | ") : "None found in input",
        status: entityData.errorMessages.length > 0 ? "ok" : "warn",
      },
      ...(entityData.environment.os
        ? [{ label: "Environment — OS", value: entityData.environment.os, status: "info" as const }]
        : [{ label: "Environment — OS", value: "Not specified", status: "warn" as const }]),
      ...(entityData.environment.runtime
        ? [{ label: "Environment — Runtime", value: entityData.environment.runtime, status: "info" as const }]
        : [{ label: "Environment — Runtime", value: "Not specified", status: "warn" as const }]),
      ...(entityData.environment.version
        ? [{ label: "Environment — Version", value: entityData.environment.version, status: "info" as const }]
        : []),
      ...(entityData.additionalContext
        ? [{ label: "Additional context", value: entityData.additionalContext, status: "info" as const }]
        : []),
    ],
  });

  // ── Deterministic confidence scoring (runs immediately after entity extraction) ──
  //    No LLM involvement — score is fully auditable and reproducible.
  const scored = calculateConfidenceScore(entityData, rawInput, codeContext, hasSimilarBugs);

  const rubricLines = (Object.keys(scored.rubric) as (keyof typeof scored.rubric)[])
    .map((k) => `  ${RUBRIC_LABELS[k as keyof typeof RUBRIC_LABELS] ?? k}: ${scored.rubric[k]}/${RUBRIC_WEIGHTS[k as keyof typeof RUBRIC_WEIGHTS]}`)
    .join("\n");

  auditTrail.push({
    timestamp: new Date().toISOString(),
    agent: "Confidence Scorer",
    action: "calculated_score",
    decision: `Deterministic score: ${scored.score}/100. Factors awarded: ${Object.values(scored.rubric).filter(v => v > 0).length}/${Object.keys(scored.rubric).length}.`,
    rationale: `Score computed from rubric — not LLM-generated. Every factor is verifiable from the raw input alone.`,
    details: [
      ...(Object.keys(scored.rubric) as (keyof typeof scored.rubric)[]).map((k) => ({
        label: RUBRIC_LABELS[k as keyof typeof RUBRIC_LABELS] ?? k,
        value: `+${scored.rubric[k]} / ${RUBRIC_WEIGHTS[k as keyof typeof RUBRIC_WEIGHTS]}pts`,
        status: (scored.rubric[k] > 0 ? "ok" : "warn") as "ok" | "warn",
      })),
      { label: "Total score", value: `${scored.score}/100`, status: (scored.score >= 70 ? "ok" : scored.score >= 40 ? "warn" : "error") as "ok" | "warn" | "error" },
      ...scored.missing.map((m) => ({ label: "Missing signal", value: m, status: "warn" as const })),
    ],
  });

  // ── Agent 2: Hypothesis Generator ────────────────────────────────────────
  //    Receives validated EntityExtractionOutput — never runs on unvalidated entity data

  const t0_hyp = Date.now();
  const hypothesesData: HypothesesOutput = await runValidatedAgent(
    "Hypothesis Generator",
    HypothesesSchema,
    `You are an expert debugging AI. Given structured bug entities extracted from a ${sourceLabel}, generate 3-5 hypotheses about the root cause.

CRITICAL: Respond ONLY with a valid JSON object. No markdown. No explanation. No code fences.
Use this exact schema:
${HYPOTHESES_SCHEMA_HINT}

Rules:
- Generate 3-5 distinct hypotheses, ordered by likelihood descending
- For each hypothesis: assess likelihood (high/medium/low), list evidence for and against
- Mark status as "retained" or "eliminated" based on available evidence
- Consider: race conditions, state management, env mismatches, version conflicts, async timing, config errors`,
    `Validated bug entities:\n${JSON.stringify(entityData, null, 2)}`,
    onEvent
  );

  const hypMs = Date.now() - t0_hyp;
  const retained = hypothesesData.hypotheses.filter((h) => h.status === "retained").length;
  const eliminated = hypothesesData.hypotheses.filter((h) => h.status === "eliminated").length;

  auditTrail.push({
    timestamp: new Date().toISOString(),
    agent: "Hypothesis Generator",
    action: "generated_hypotheses",
    durationMs: hypMs,
    decision: `Generated ${hypothesesData.hypotheses.length} hypotheses: ${retained} retained, ${eliminated} eliminated. Top: "${hypothesesData.hypotheses[0]?.title}" (${hypothesesData.hypotheses[0]?.likelihood} likelihood)`,
    rationale:
      "Hypotheses ranked by likelihood using entity signals. Each elimination is based on contradicting evidence derived directly from the extracted entities.",
    details: hypothesesData.hypotheses.flatMap((h, idx) => [
      {
        label: `H${idx + 1}: ${h.title}`,
        value: `${h.likelihood.toUpperCase()} likelihood — ${h.status === "retained" ? "✓ RETAINED" : "✗ ELIMINATED"}`,
        status: (h.status === "retained" ? "ok" : "warn") as "ok" | "warn",
      },
      { label: `  Mechanism`, value: h.mechanism, status: "info" as const },
      {
        label: h.status === "eliminated" ? `  Eliminated because` : `  Retained because`,
        value: h.statusReason,
        status: (h.status === "retained" ? "ok" : "error") as "ok" | "error",
      },
      ...(h.refutingEvidence.length > 0
        ? [{ label: `  Refuting evidence`, value: h.refutingEvidence.join("; "), status: "warn" as const }]
        : []),
    ]),
  });

  // ── Agent 3: Step Validator ───────────────────────────────────────────────
  //    Receives validated EntityExtractionOutput + HypothesesOutput

  const t0_step = Date.now();
  const stepData: StepValidationOutput = await runValidatedAgent(
    "Step Validator",
    StepValidationSchema,
    `You are an expert QA engineer. Given validated bug entities and hypotheses, create precise reproduction steps a developer can follow in under 5 minutes.

CRITICAL: Respond ONLY with a valid JSON object. No markdown. No explanation. No code fences.
Use this exact schema:
${STEPS_SCHEMA_HINT}

Rules:
- steps: numbered, precise steps with exact values/inputs where possible
- expectedResult: one sentence of what should happen
- actualResult: one sentence of what happens instead (the bug)
- confidenceRating: integer 1-10 reflecting confidence that these steps reproduce the bug
- validationNotes: notes on how to rule out each retained hypothesis`,
    `Original ${sourceLabel}:\n${rawInput}\n\nValidated entities:\n${JSON.stringify(
      entityData,
      null,
      2
    )}\n\nValidated hypotheses:\n${JSON.stringify(hypothesesData.hypotheses, null, 2)}${context}`,
    onEvent
  );

  const stepMs = Date.now() - t0_step;
  auditTrail.push({
    timestamp: new Date().toISOString(),
    agent: "Step Validator",
    action: "validated_steps",
    durationMs: stepMs,
    decision: `Generated ${stepData.steps.length} reproduction steps with ${stepData.confidenceRating}/10 confidence. ${stepData.prerequisites.length} prerequisite(s).`,
    rationale:
      "Steps derived from the highest-likelihood retained hypothesis. Validation notes cover how to rule out each alternative.",
    details: [
      ...stepData.prerequisites.map((p, i) => ({
        label: `Prerequisite ${i + 1}`,
        value: p,
        status: "info" as const,
      })),
      ...stepData.environmentConfig.map((e, i) => ({
        label: `Environment config ${i + 1}`,
        value: e,
        status: "info" as const,
      })),
      ...stepData.steps.map((s) => ({
        label: `Step ${s.number}`,
        value: s.action + (s.expectedOutcome ? ` → ${s.expectedOutcome}` : ""),
        status: "ok" as const,
      })),
      { label: "Expected result", value: stepData.expectedResult, status: "ok" as const },
      { label: "Actual result (bug)", value: stepData.actualResult, status: "error" as const },
      {
        label: "Reproduction confidence",
        value: `${stepData.confidenceRating}/10`,
        status: (stepData.confidenceRating >= 7 ? "ok" : stepData.confidenceRating >= 5 ? "warn" : "error") as "ok" | "warn" | "error",
      },
      ...stepData.validationNotes.map((n, i) => ({
        label: `Validation note ${i + 1}`,
        value: n,
        status: "info" as const,
      })),
    ],
  });

  // ── Agent 4: Test Writer ──────────────────────────────────────────────────
  //    Receives validated EntityExtractionOutput + StepValidationOutput

  const t0_test = Date.now();
  const frameworkConstraint = frameworkHint
    ? `\n\nFRAMEWORK OVERRIDE: You MUST use "${frameworkHint}" as the framework. Do not choose any other framework. The "framework" field in your JSON MUST be "${frameworkHint}".`
    : "";
  const testData: TestWriterOutput = await runValidatedAgent(
    "Test Writer",
    TestWriterSchema,
    `You are a senior software engineer. Generate complete, executable test code to reproduce and verify the described bug.

CRITICAL: Respond ONLY with a valid JSON object. No markdown. No explanation. No code fences.
Use this exact schema:
${TEST_SCHEMA_HINT}

Rules:
- testCode: the COMPLETE, runnable test — no placeholders, no pseudocode
- Add a top comment: // Bug Reproduction Test — [one-line description]
- Assertions must FAIL with the bug present and PASS once it is fixed
- Cover: main reproduction case, one edge case, one regression guard
- Default to Jest + TypeScript unless another framework is clearly implied
- framework and language must be explicit strings (e.g. "Jest", "TypeScript")${frameworkConstraint}`,
    `Original ${sourceLabel}:\n${rawInput}\n\nValidated entities:\n${JSON.stringify(
      entityData,
      null,
      2
    )}\n\nValidated reproduction steps:\n${JSON.stringify(stepData, null, 2)}${context}`,
    onEvent
  );

  const testMs = Date.now() - t0_test;
  auditTrail.push({
    timestamp: new Date().toISOString(),
    agent: "Test Writer",
    action: "generated_tests",
    durationMs: testMs,
    decision: `Generated ${testData.framework} (${testData.language}) test${frameworkHint ? ` [override: ${frameworkHint}]` : ""} covering ${testData.coverageAreas.length} area(s): ${testData.coverageAreas.join(", ")}`,
    rationale:
      "Test assertions designed to fail with the bug present and pass when the root cause is fixed. Coverage aligns with the highest-likelihood retained hypothesis.",
    details: [
      {
        label: frameworkHint ? "Framework (override)" : "Framework detected",
        value: testData.framework,
        status: "ok" as const,
      },
      {
        label: "framework source",
        value: frameworkHint ? "user override" : "auto-detected",
        status: (frameworkHint ? "info" : "ok") as "info" | "ok",
      },
      { label: "Language", value: testData.language, status: "ok" as const },
      { label: "Description", value: testData.description, status: "info" as const },
      ...testData.coverageAreas.map((area, i) => ({
        label: `Coverage area ${i + 1}`,
        value: area,
        status: "ok" as const,
      })),
    ],
  });

  // ── Syntax Validator (runs after Test Writer, before Synthesizer) ─────────
  //    Deterministic check — no LLM call on the happy path.
  //    On failure: one LLM correction attempt, then warn the user.

  let finalTestData = testData;
  let testSyntaxStatus: TestSyntaxStatus = "unchecked";

  const syntaxResult = validateTestCode(testData.testCode, testData.framework, testData.language);

  if (syntaxResult.status === "verified" || syntaxResult.status === "unchecked") {
    testSyntaxStatus = syntaxResult.status;
    onEvent({ type: "agent_start", agentName: "Syntax Validator", content: `Checking ${testData.framework} syntax...` });
    onEvent({
      type: "agent_done",
      agentName: "Syntax Validator",
      content: syntaxResult.status === "verified"
        ? `Syntax valid — ${testData.framework} / ${testData.language}`
        : `Syntax check skipped for framework: ${testData.framework}`,
    });
    onEvent({ type: "agent_validated", agentName: "Syntax Validator", content: "" });
  } else {
    // Syntax error detected — attempt one LLM correction
    onEvent({
      type: "agent_start",
      agentName: "Syntax Validator",
      content: `Syntax error in ${testData.framework} code — requesting correction...`,
    });
    onEvent({
      type: "agent_retry",
      agentName: "Syntax Validator",
      content: syntaxResult.line
        ? `Line ${syntaxResult.line}: ${syntaxResult.error ?? "syntax error"}`
        : (syntaxResult.error ?? "syntax error detected"),
    });

    const correctionSystemPrompt = `You are a code quality assistant. A syntax error was detected in the test code you generated. Fix it and return the corrected JSON.

CRITICAL: Respond ONLY with a valid JSON object. No markdown. No explanation. No code fences.
Use this exact schema:
${TEST_SCHEMA_HINT}`;

    const correctionUserPrompt = `The following ${testData.framework} (${testData.language}) test code has a syntax error.

${syntaxResult.line ? `Error at line ${syntaxResult.line}: ` : "Error: "}${syntaxResult.error ?? "syntax error"}

FAULTY CODE:
${testData.testCode}

Fix ONLY the syntax error. Do not change the test logic, assertions, or coverage areas.

CRITICAL OUTPUT RULE: Return the COMPLETE JSON object with ALL schema fields populated.
Do NOT return only the corrected code as a plain text block.
The corrected code belongs inside the "testCode" field of the JSON.
All other fields (framework, language, description, coverageAreas) must be present and unchanged.
If you return raw code instead of a JSON object, the response will be rejected.`;

    const { content: correctedRaw } = await runAgent(
      "Syntax Validator",
      correctionSystemPrompt,
      correctionUserPrompt,
      onEvent
    );

    const correctedParsed = safeParseStructured(TestWriterSchema, correctedRaw);
    if (correctedParsed.success) {
      const recheck = validateTestCode(
        correctedParsed.data.testCode,
        correctedParsed.data.framework,
        correctedParsed.data.language
      );
      if (recheck.valid) {
        finalTestData = correctedParsed.data;
        testSyntaxStatus = "verified";
        onEvent({ type: "agent_validated", agentName: "Syntax Validator", content: "Syntax corrected and verified" });
      } else {
        testSyntaxStatus = "warning";
        onEvent({
          type: "agent_done",
          agentName: "Syntax Validator",
          content: `Correction still has issues — review before running. ${recheck.error ?? ""}`,
        });
      }
    } else {
      testSyntaxStatus = "warning";
      onEvent({
        type: "agent_done",
        agentName: "Syntax Validator",
        content: "Correction failed schema validation — review before running",
      });
    }

    auditTrail.push({
      timestamp: new Date().toISOString(),
      agent: "Syntax Validator",
      action: "syntax_correction",
      decision: testSyntaxStatus === "verified"
        ? "Syntax error detected and corrected on retry"
        : "Syntax error persisted after one correction attempt — warning issued",
      rationale: `Original error: ${syntaxResult.error ?? "unknown"}${syntaxResult.line ? ` at line ${syntaxResult.line}` : ""}`,
      details: [
        {
          label: "Original error",
          value: `${syntaxResult.error ?? "unknown"}${syntaxResult.line ? ` (line ${syntaxResult.line})` : ""}`,
          status: "error" as const,
        },
        {
          label: "Correction outcome",
          value: testSyntaxStatus === "verified" ? "Corrected and re-verified successfully" : "Correction still had issues — manual review needed",
          status: (testSyntaxStatus === "verified" ? "ok" : "warn") as "ok" | "warn",
        },
      ],
    });
  }

  // ── Agent 5: Analysis Synthesizer ─────────────────────────────────────────
  //    Receives all four prior validated outputs

  const t0_synth = Date.now();
  const synthData: SynthesizerOutput = await runValidatedAgent(
    "Analysis Synthesizer",
    SynthesizerSchema,
    `You are a debugging expert and technical writer. Synthesize the full bug analysis into a structured JSON report.

CRITICAL: Respond ONLY with a valid JSON object. No markdown. No explanation. No code fences.
Use this exact schema:
${SYNTHESIZER_SCHEMA_HINT}

Rules:
- diagram: build a structured execution-path diagram — see schema for node/edge types and ID rules
  - The diagram MUST reflect the actual reproduction path found — different steps, different nodes, different failure point
  - Every eliminated hypothesis must appear as an 'eliminated' node connected by a dashed edge (isAlternate: true)
  - Node IDs MUST be alphanumeric+underscore only, starting with a letter: "S0", "N1", "FAIL", "ELIM_cache" — NOT "end" (reserved)
  - Scale correctly: a 3-step path should have 5-7 nodes; a 7-step path should have 9-12 nodes
- clarifyingQuestions: exactly 3-5 targeted questions that would confirm the root cause; make them specific and actionable
- confidenceEvidence: list 2-4 specific pieces of evidence from the analysis that support the reproduction path
- confidenceAssumptions: list any assumptions made due to incomplete information (can be empty array if none)
- severity: based on user impact, component criticality, reproducibility, and data risk
- NOTE: Do NOT include a confidenceScore field — the confidence score has already been calculated deterministically`,
    `Full analysis summary:

Entities:\n${JSON.stringify(entityData, null, 2)}

Hypotheses:\n${JSON.stringify(hypothesesData.hypotheses, null, 2)}

Reproduction steps:\n${JSON.stringify(stepData, null, 2)}

Test framework: ${finalTestData.framework} — coverage: ${finalTestData.coverageAreas.join(", ")}`,
    onEvent
  );

  const synthMs = Date.now() - t0_synth;
  const totalMs = Date.now() - pipelineStartMs;
  auditTrail.push({
    timestamp: new Date().toISOString(),
    agent: "Analysis Synthesizer",
    action: "synthesized_analysis",
    durationMs: synthMs,
    decision: `Confidence: ${scored.score}%, severity: ${synthData.severity}. Flow diagram: ${synthData.diagram.nodes.length} nodes, ${synthData.diagram.edges.length} edges. ${synthData.clarifyingQuestions.length} clarifying questions.`,
    rationale: `Severity: ${synthData.severityReason}`,
    details: [
      { label: "Severity", value: `${synthData.severity.toUpperCase()} — ${synthData.severityReason}`, status: (synthData.severity === "critical" ? "error" : synthData.severity === "high" ? "warn" : "ok") as "ok" | "warn" | "error" },
      { label: "Confidence score", value: `${scored.score}/100`, status: (scored.score >= 70 ? "ok" : scored.score >= 40 ? "warn" : "error") as "ok" | "warn" | "error" },
      { label: "Flow diagram", value: `${synthData.diagram.nodes.length} nodes · ${synthData.diagram.edges.length} edges · failure at "${synthData.diagram.failureNodeId}"`, status: "info" as const },
      ...synthData.confidenceEvidence.map((e, i) => ({ label: `Evidence ${i + 1}`, value: e, status: "ok" as const })),
      ...synthData.confidenceAssumptions.map((a, i) => ({ label: `Assumption ${i + 1}`, value: a, status: "warn" as const })),
      { label: "Total pipeline duration", value: fmtMs(totalMs), status: "info" as const },
    ],
  });

  logger.info(
    { confidenceScore: scored.score / 100, severity: synthData.severity, inputType },
    "Pipeline complete — core 5 agents validated, running Fix Suggester + Auto-Tagger"
  );

  // ── Agent 6: Fix Suggester (non-critical — pipeline continues on failure) ──
  let fixSuggestionsJson = "[]";
  try {
    const t0_fix = Date.now();
    const fixData: FixSuggesterOutput = await runValidatedAgent(
      "Fix Suggester",
      FixSuggesterSchema,
      `You are a senior software engineer specialising in root cause analysis and code fixes.
Given a bug analysis, generate 3-5 concrete, ranked code fix suggestions.

You MUST return ONLY valid JSON matching this schema:
${FIX_SUGGESTER_SCHEMA_HINT}

Rules:
- Only suggest fixes for RETAINED hypotheses — never for eliminated ones
- codeLocation must name the specific function/class/file
- effort: "low" = < 2 hours, "medium" = half to full day, "high" = multiple days or architectural change
- Fix descriptions must be actionable — no vague advice like "add error handling"`,
      `Component: ${entityData.component}
Trigger: ${entityData.triggerAction}
Actual behavior: ${entityData.actualBehavior}
Severity: ${synthData.severity}
Retained hypotheses: ${JSON.stringify(hypothesesData.hypotheses.filter(h => h.status === "retained").map(h => ({ title: h.title, mechanism: h.mechanism })))}
${codeContext ? `Code context:\n${codeContext}` : "No code context provided."}`,
      onEvent
    );
    const fixMs = Date.now() - t0_fix;
    fixSuggestionsJson = JSON.stringify(fixData.suggestions);
    auditTrail.push({
      timestamp: new Date().toISOString(),
      agent: "Fix Suggester",
      action: "generated_fix_suggestions",
      decision: `Generated ${fixData.suggestions.length} fix suggestion(s) — top: "${fixData.suggestions[0]?.title}"`,
      rationale: fixData.summary,
      durationMs: fixMs,
      details: fixData.suggestions.slice(0, 3).map((s, i) => ({
        label: `Fix ${i + 1} (${s.effort} effort, ${s.confidence} confidence)`,
        value: `${s.title} — ${s.codeLocation}`,
        status: s.confidence === "high" ? ("ok" as const) : s.confidence === "medium" ? ("warn" as const) : ("info" as const),
      })),
    });
  } catch (err) {
    logger.warn({ err }, "Fix Suggester failed — continuing pipeline");
    auditTrail.push({
      timestamp: new Date().toISOString(),
      agent: "Fix Suggester",
      action: "skipped",
      decision: "Fix suggestions unavailable",
      rationale: "Agent failed or timed out — non-critical, pipeline result unaffected",
    });
  }

  // ── Agent 7: Auto-Tagger (non-critical) ───────────────────────────────────
  let autoTagsJson = "[]";
  try {
    const t0_tag = Date.now();
    const tagRaw = await runAgent(
      "Auto-Tagger",
      `You are a bug taxonomy expert. Generate 3-8 short, lowercase, hyphenated tags for this bug.
Return ONLY a JSON array of strings. No explanation, no markdown, no code fences.
Example output: ["null-reference","async-race","auth"]`,
      `Component: ${entityData.component}
Trigger: ${entityData.triggerAction}
Actual: ${entityData.actualBehavior}
Severity: ${synthData.severity}
Errors: ${entityData.errorMessages.slice(0, 3).join("; ")}
Input type: ${inputType}`,
      onEvent
    );
    const tagMs = Date.now() - t0_tag;
    const tagContent = tagRaw.content.replace(/```json?\n?/g, "").replace(/```\n?/g, "").trim();
    const arrMatch = tagContent.match(/\[[\s\S]*?\]/);
    if (arrMatch) {
      const rawTags = JSON.parse(arrMatch[0]) as unknown[];
      const cleanTags = rawTags
        .filter((t): t is string => typeof t === "string")
        .map(t => t.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 30))
        .filter(t => t.length > 0)
        .slice(0, 10);
      if (cleanTags.length > 0) autoTagsJson = JSON.stringify(cleanTags);
    }
    auditTrail.push({
      timestamp: new Date().toISOString(),
      agent: "Auto-Tagger",
      action: "generated_tags",
      decision: `Tagged: ${autoTagsJson}`,
      rationale: "Taxonomy tags for search and classification",
      durationMs: tagMs,
    });
  } catch (err) {
    logger.warn({ err }, "Auto-Tagger failed — continuing pipeline");
  }

  // ── Serialize structured outputs for DB storage ───────────────────────────
  return {
    extractedEntities: JSON.stringify(entityData),
    hypotheses: JSON.stringify(hypothesesData.hypotheses),
    reproductionSteps: JSON.stringify(stepData),
    testCode: finalTestData.testCode,
    flowDiagram: generateMermaidFromDiagram(synthData.diagram),
    clarifyingQuestions: JSON.stringify(synthData.clarifyingQuestions),
    testSyntaxStatus,
    confidenceScore: scored.score / 100,
    confidenceBreakdown: {
      score: scored.score,
      rubric: scored.rubric,
      missing: scored.missing,
      evidence: synthData.confidenceEvidence,
      assumptions: synthData.confidenceAssumptions,
    },
    severity: synthData.severity,
    severityReason: synthData.severityReason,
    auditTrail,
    fixSuggestions: fixSuggestionsJson,
    autoTags: autoTagsJson,
  };
}

// ─── Tool: Test Writer override (regenerate test for a different framework) ───

export async function runTestWriterWithOverride(
  rawInput: string,
  inputType: string,
  extractedEntitiesJson: string,
  reproductionStepsJson: string,
  codeContext: string | null | undefined,
  framework: string
): Promise<{ testCode: string; framework: string; language: string; testSyntaxStatus: TestSyntaxStatus }> {
  const sourceLabel = SOURCE_TYPE_LABELS[inputType] ?? "bug report";
  const context = codeContext
    ? `\n\nRelevant code context:\n\`\`\`\n${codeContext}\n\`\`\``
    : "";

  const noop = (_: AgentEvent) => { /* fire-and-forget — no SSE for regenerate */ };

  const testData = await runValidatedAgent(
    "Test Writer",
    TestWriterSchema,
    `You are a senior software engineer. Generate complete, executable test code to reproduce and verify the described bug.

CRITICAL: Respond ONLY with a valid JSON object. No markdown. No explanation. No code fences.
Use this exact schema:
${TEST_SCHEMA_HINT}

FRAMEWORK OVERRIDE: You MUST use "${framework}" as the framework. The "framework" field MUST be "${framework}".

Rules:
- testCode: the COMPLETE, runnable test — no placeholders, no pseudocode
- Add a top comment: // Bug Reproduction Test — [one-line description]
- Assertions must FAIL with the bug present and PASS once it is fixed
- Cover: main reproduction case, one edge case, one regression guard
- framework and language must be explicit strings`,
    `Original ${sourceLabel}:\n${rawInput}\n\nValidated entities:\n${extractedEntitiesJson}\n\nValidated reproduction steps:\n${reproductionStepsJson}${context}`,
    noop
  );

  let finalTestCode = testData.testCode;
  let testSyntaxStatus: TestSyntaxStatus = "unchecked";

  const syntaxResult = validateTestCode(testData.testCode, testData.framework, testData.language);
  if (syntaxResult.status === "verified" || syntaxResult.status === "unchecked") {
    testSyntaxStatus = syntaxResult.status;
  } else {
    const correctionUserPrompt = `The following ${testData.framework} (${testData.language}) test has a syntax error.

${syntaxResult.line ? `Error at line ${syntaxResult.line}: ` : "Error: "}${syntaxResult.error ?? "syntax error"}

FAULTY CODE:
${testData.testCode}

Fix ONLY the syntax error. Return the complete corrected JSON.`;

    const { content: correctedRaw } = await runAgent(
      "Test Writer [correction]",
      `You are a code quality assistant. Fix the syntax error and return valid JSON matching the test schema.\n\nCRITICAL: Respond ONLY with a valid JSON object.\n${TEST_SCHEMA_HINT}`,
      correctionUserPrompt,
      noop
    );

    const correctedParsed = safeParseStructured(TestWriterSchema, correctedRaw);
    if (correctedParsed.success) {
      const recheck = validateTestCode(correctedParsed.data.testCode, correctedParsed.data.framework, correctedParsed.data.language);
      if (recheck.valid) {
        finalTestCode = correctedParsed.data.testCode;
        testSyntaxStatus = "verified";
      } else {
        testSyntaxStatus = "warning";
      }
    } else {
      testSyntaxStatus = "warning";
    }
  }

  return { testCode: finalTestCode, framework: testData.framework, language: testData.language, testSyntaxStatus };
}

// ─── Tool: Environment Diff ───────────────────────────────────────────────────

export async function runEnvDiff(
  env1: string,
  env2: string,
  bugDescription: string,
  label1: string,
  label2: string
): Promise<string> {
  const response = await getActiveClient().chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_completion_tokens: 3000,
    messages: [
      {
        role: "system",
        content: `You are an expert in environment configuration and intermittent bug diagnosis. Compare two environment configurations and identify which differences are most likely causing the described bug or behavior discrepancy.

For each difference found, classify its impact:
- critical: Almost certainly causing the bug
- likely: Probably related to the bug
- unlikely: Might be relevant but probably not
- irrelevant: Unrelated to the described bug

Output MUST be valid JSON in this exact structure:
{
  "differences": [
    {
      "key": "VARIABLE_NAME",
      "value1": "value in ${label1}",
      "value2": "value in ${label2}",
      "impact": "critical|likely|unlikely|irrelevant",
      "reasoning": "Why this difference matters for the bug"
    }
  ],
  "verdict": "Detailed explanation of the most likely culprit",
  "likelihood": "high|medium|low",
  "summary": "One sentence summary of the key finding"
}

Be thorough — consider Node versions, timeouts, feature flags, connection strings, memory limits, TLS settings, etc.`,
      },
      {
        role: "user",
        content: `Bug description: ${bugDescription}

${label1} environment:
${env1}

${label2} environment:
${env2}

Analyze the differences and identify which config change is most likely responsible for the bug.`,
      },
    ],
  });

  return (
    response.choices[0]?.message?.content ??
    '{"differences":[],"verdict":"Unable to analyze","likelihood":"low","summary":"Analysis failed"}'
  );
}

// ─── Tool: NL2Test ───────────────────────────────────────────────────────────

export async function runNl2Test(
  description: string,
  framework: string,
  codeContext: string | undefined
): Promise<string> {
  const context = codeContext ? `\n\nRelevant code:\n\`\`\`\n${codeContext}\n\`\`\`` : "";

  const response = await getActiveClient().chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_completion_tokens: 3000,
    messages: [
      {
        role: "system",
        content: `You are a senior test engineer. Generate complete, executable test code from a plain English description.

Output MUST be valid JSON:
{
  "testCode": "// complete test code here",
  "framework": "Jest|Pytest|Mocha|Cypress|etc",
  "explanation": "What the test does and why it's structured this way",
  "coverageNotes": "What scenarios are covered and what's left out"
}

Requirements for the test code:
- Complete and runnable with no placeholders
- Descriptive test names
- Setup/teardown as needed
- Cover the happy path AND at least one failure/edge case
- Add inline comments explaining intent`,
      },
      {
        role: "user",
        content: `Test description: ${description}\nPreferred framework: ${framework || "Jest + TypeScript"}${context}`,
      },
    ],
  });

  return (
    response.choices[0]?.message?.content ??
    '{"testCode":"","framework":"Jest","explanation":"","coverageNotes":""}'
  );
}

// ─── Tool: Flaky Detector ─────────────────────────────────────────────────────

export async function runFlakyDetector(
  testCode: string,
  language: string
): Promise<string> {
  const response = await getActiveClient().chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_completion_tokens: 3000,
    messages: [
      {
        role: "system",
        content: `You are an expert in test reliability and flakiness detection. Analyze the provided test code and identify which tests are likely to be flaky.

Flakiness categories:
- race_condition: Async timing issues, missing awaits, concurrent state
- environment_dependency: Relies on specific OS, timezone, file paths, env vars
- non_deterministic_data: Random values, non-seeded random, floating point
- timing: Sleep/timeout based assertions, assumes execution order
- external_dependency: Calls real APIs, databases, or file system
- state_leak: Tests share mutable state, missing cleanup
- other: Other flakiness cause

Output MUST be valid JSON:
{
  "flakyTests": [
    {
      "testName": "exact test name or describe block",
      "riskLevel": "high|medium|low",
      "category": "race_condition|environment_dependency|non_deterministic_data|timing|external_dependency|state_leak|other",
      "explanation": "Specific explanation of why this test is flaky and what exact line/pattern causes it",
      "fix": "Concrete suggestion to fix the flakiness"
    }
  ],
  "overallRisk": "high|medium|low|none",
  "summary": "Overall assessment of the test suite reliability"
}

If no flaky tests are found, return an empty flakyTests array with overallRisk "none".`,
      },
      {
        role: "user",
        content: `Language/Framework: ${language || "JavaScript/TypeScript"}\n\nTest code:\n\`\`\`\n${testCode}\n\`\`\``,
      },
    ],
  });

  return (
    response.choices[0]?.message?.content ??
    '{"flakyTests":[],"overallRisk":"none","summary":"Unable to analyze"}'
  );
}

// ─── Tool: Correlation Engine ─────────────────────────────────────────────────

export async function runCorrelation(
  targetInput: string,
  targetEntities: string,
  candidates: Array<{
    id: number;
    title: string;
    rawInput: string;
    extractedEntities: string | null;
    createdAt: Date;
  }>
): Promise<string> {
  if (candidates.length === 0) return "[]";

  const candidateSummaries = candidates
    .slice(0, 10)
    .map(
      (c) =>
        `ID: ${c.id}\nTitle: ${c.title}\nInput (truncated): ${c.rawInput.slice(0, 300)}\nEntities: ${(c.extractedEntities ?? "").slice(0, 300)}`
    )
    .join("\n\n---\n\n");

  const response = await getActiveClient().chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_completion_tokens: 2000,
    messages: [
      {
        role: "system",
        content: `You are a bug pattern recognition AI. Compare a target bug report against a set of historical bug reports and identify structural similarities — same execution paths, same failure signatures, same root cause patterns.

Output MUST be valid JSON array of correlation matches (only include bugs with similarity >= 30%):
[
  {
    "id": 123,
    "title": "Bug title",
    "similarity": 87,
    "commonFactors": ["JWT token handling", "async race condition", "authentication middleware"],
    "rootCauseNote": "Historical bug was caused by X — current bug shows the same Y pattern",
    "createdAt": "ISO timestamp"
  }
]

Return [] if no meaningful correlations are found. Be precise — only flag genuine structural matches, not superficial keyword overlap.`,
      },
      {
        role: "user",
        content: `Target bug:\nTitle input: ${targetInput.slice(0, 500)}\nExtracted entities: ${targetEntities.slice(0, 500)}\n\nHistorical bugs to compare against:\n\n${candidateSummaries}`,
      },
    ],
  });

  return response.choices[0]?.message?.content ?? "[]";
}

// ─── Tool: Regression Guard ───────────────────────────────────────────────────

export async function runRegressionGuard(
  testCode: string,
  codeChanges: string,
  bugDescription: string
): Promise<string> {
  const response = await getActiveClient().chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_completion_tokens: 4096,
    messages: [
      {
        role: "system",
        content: `You are an expert test coverage analyst. Given a test, a code diff, and a bug description, determine whether the test would catch the regression.

Return ONLY this JSON (no markdown, no explanation):
{
  "verdict": "would_catch | would_miss | uncertain",
  "confidence": "high | medium | low",
  "reasoning": "Detailed paragraph explaining why the test would or would not catch this",
  "criticalLines": ["exact lines from the diff that the test exercises"],
  "missedScenarios": ["test cases not covered that could hide the regression"],
  "recommendation": "How to strengthen the test to make it a proper regression guard"
}`,
      },
      {
        role: "user",
        content: `Test code:\n${testCode}\n\nCode changes (diff):\n${codeChanges}\n\nBug description:\n${bugDescription}`,
      },
    ],
  });
  return response.choices[0]?.message?.content ?? "{}";
}

// ─── Tool: Image / Screenshot Analyzer ───────────────────────────────────────

export async function runImageAnalyze(
  imageDescription: string,
  additionalContext?: string
): Promise<string> {
  const response = await getActiveClient().chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_completion_tokens: 4096,
    messages: [
      {
        role: "system",
        content: `You are an expert bug analyst. Given a description of a screenshot or screen recording showing a bug, extract all bug-relevant information.

Return ONLY this JSON (no markdown, no explanation):
{
  "extractedText": "All visible error messages, stack traces, codes, status codes",
  "uiState": "What the UI looked like at the point of failure",
  "visibleErrors": ["specific error messages or codes"],
  "suggestedBugReport": "Complete well-structured bug report ready to submit to the pipeline",
  "inputType": "raw_text | stack_trace | log_file",
  "confidence": "high | medium | low"
}`,
      },
      {
        role: "user",
        content: `Screenshot/recording description:\n${imageDescription}${additionalContext ? `\n\nAdditional context:\n${additionalContext}` : ""}`,
      },
    ],
  });
  return response.choices[0]?.message?.content ?? "{}";
}

// ─── Tool: Bug Digest ─────────────────────────────────────────────────────────

export async function runBugDigest(
  analyses: Array<{
    id: number;
    title: string;
    severity: string | null;
    status: string;
    inputType: string;
    confidenceScore: number | null;
    createdAt: Date;
    autoTags: string | null;
  }>,
  periodLabel: string
): Promise<string> {
  const summary = analyses.slice(0, 20).map(a => {
    const tags = (() => { try { return (JSON.parse(a.autoTags ?? "[]") as string[]).join(", "); } catch { return ""; } })();
    return `- [${a.severity ?? "unknown"}] ${a.title} (type: ${a.inputType}, status: ${a.status}, confidence: ${a.confidenceScore != null ? Math.round(a.confidenceScore * 100) + "%" : "N/A"}${tags ? `, tags: ${tags}` : ""})`;
  }).join("\n");

  const response = await getActiveClient().chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_completion_tokens: 4096,
    messages: [
      {
        role: "system",
        content: `You are an engineering team lead writing a bug digest report for ${periodLabel}. Analyse the list of bugs and produce an insightful summary.

Return ONLY this JSON (no markdown, no explanation):
{
  "summary": "2-3 sentence executive overview of the period",
  "highlights": [
    { "title": "Short callout title", "detail": "Detail text", "type": "critical | info | warning" }
  ],
  "patterns": ["recurring theme or root-cause cluster 1", "recurring theme 2"],
  "recommendations": ["actionable item for the engineering team 1", "item 2"],
  "topComponents": ["most affected component 1", "component 2"],
  "riskLevel": "critical | high | medium | low",
  "statsNote": "Key numbers in one sentence"
}`,
      },
      {
        role: "user",
        content: `Bugs for ${periodLabel} (${analyses.length} total):\n${summary}`,
      },
    ],
  });
  return response.choices[0]?.message?.content ?? "{}";
}

// ─── Tool: Multi-Environment Reproduction Matrix ──────────────────────────────

export async function runMultiEnvMatrix(
  reproductionSteps: string,
  environments: Array<{ name: string; config: string }>,
  bugDescription: string
): Promise<string> {
  const envList = environments
    .map((e, i) => `Environment ${i + 1} — ${e.name}:\n${e.config}`)
    .join("\n\n");

  const response = await getActiveClient().chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_completion_tokens: 4096,
    messages: [
      {
        role: "system",
        content: `You are a senior QA engineer. Given bug reproduction steps and multiple environment configs, predict whether the bug would reproduce in each environment.

Return ONLY this JSON (no markdown, no explanation):
{
  "matrix": [
    {
      "environment": "Environment name",
      "reproduces": "yes | no | likely | unlikely",
      "confidence": "high | medium | low",
      "reasoning": "Why this environment would or would not reproduce the bug",
      "keyDifference": "The specific config key/value that matters most"
    }
  ],
  "isolationVerdict": "What the matrix reveals about the root cause (env-specific vs code-level)",
  "recommendation": "Which environment to debug in and why"
}`,
      },
      {
        role: "user",
        content: `Bug description:\n${bugDescription}\n\nReproduction steps:\n${reproductionSteps}\n\nEnvironments:\n${envList}`,
      },
    ],
  });
  return response.choices[0]?.message?.content ?? "{}";
}
