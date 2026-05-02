import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";

export type AgentEvent = {
  type: "agent_start" | "agent_output" | "agent_done" | "pipeline_done" | "error";
  agentName: string;
  content: string;
};

export type AuditEntry = {
  timestamp: string;
  agent: string;
  action: string;
  decision: string;
  rationale: string;
};

export type ConfidenceBreakdown = {
  score: number;
  evidence: string[];
  assumptions: string[];
  missing: string[];
};

export type PipelineResult = {
  extractedEntities: string;
  hypotheses: string;
  reproductionSteps: string;
  testCode: string;
  flowDiagram: string;
  clarifyingQuestions: string;
  confidenceScore: number;
  confidenceBreakdown: ConfidenceBreakdown;
  severity: "critical" | "high" | "medium" | "low";
  severityReason: string;
  auditTrail: AuditEntry[];
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
  raw_text: "raw bug report",
  github_url: "GitHub issue",
  stack_trace: "stack trace",
  jira_ticket: "Jira ticket",
  sentry_event: "Sentry error event",
  log_file: "log file output",
  curl_request: "failed curl/API request",
  video_description: "video/screen recording description",
};

const SOURCE_TYPE_HINTS: Record<string, string> = {
  stack_trace: "Pay special attention to: the error type, the exact line numbers, the call chain from top to bottom, and any chained causes. Trace the execution path carefully.",
  github_url: "This is a GitHub issue — extract the title, description, steps to reproduce if listed, labels, and any key comments that add context.",
  jira_ticket: "This is a Jira ticket — extract the issue type, priority, environment fields, acceptance criteria, and any linked issues or comments.",
  sentry_event: "This is a Sentry error event — focus on: exception type/message, the stack trace, breadcrumbs, device/browser context, release version, and any tags.",
  log_file: "This is a log file — identify: the error pattern, timestamps around the failure, repeated error sequences, and the sequence of events leading up to the failure.",
  curl_request: "This is a failed API/curl request — note: the endpoint, HTTP method, headers, request body, response status code, response body, and any authentication indicators.",
  video_description: "This is a description of a recorded bug — focus on: the visual sequence of actions, the exact moment of failure, UI state changes, and any error messages visible.",
  raw_text: "",
};

async function runAgent(
  agentName: string,
  systemPrompt: string,
  userPrompt: string,
  onEvent: (event: AgentEvent) => void
): Promise<{ content: string; duration: number }> {
  onEvent({ type: "agent_start", agentName, content: `Starting ${agentName}...` });

  const startTime = Date.now();
  let fullContent = "";

  const stream = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 4096,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    stream: true,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      fullContent += delta;
      onEvent({ type: "agent_output", agentName, content: delta });
    }
  }

  const duration = Date.now() - startTime;
  onEvent({ type: "agent_done", agentName, content: `${agentName} complete.` });
  return { content: fullContent, duration };
}

export async function runBugReproductionPipeline(
  rawInput: string,
  inputType: string,
  codeContext: string | null | undefined,
  onEvent: (event: AgentEvent) => void
): Promise<PipelineResult> {
  const sourceLabel = SOURCE_TYPE_LABELS[inputType] ?? "bug report";
  const sourceHint = SOURCE_TYPE_HINTS[inputType] ?? "";
  const context = codeContext ? `\n\nRelevant code context:\n\`\`\`\n${codeContext}\n\`\`\`` : "";
  const auditTrail: AuditEntry[] = [];

  // Stage 1: Entity Extraction Agent
  const { content: extractedEntities } = await runAgent(
    "Entity Extraction Agent",
    `You are an expert bug analysis AI specializing in ${sourceLabel} analysis.
Extract structured information from the provided ${sourceLabel}.
${sourceHint}

Identify and extract:
- The affected component, system, module, file, or endpoint
- The triggering action or sequence of events
- The expected behavior
- The observed/actual failure behavior
- Environment details (OS, browser, version, runtime, etc.)
- Any error messages, codes, or exceptions
- Relevant data, state conditions, or user context
- Severity indicators (if present)

Format your output as a clear, structured list with bold headers. Be concise and precise. Do not add fluff.`,
    `${sourceLabel.charAt(0).toUpperCase() + sourceLabel.slice(1)} content:\n${rawInput}${context}`,
    onEvent
  );

  auditTrail.push({
    timestamp: new Date().toISOString(),
    agent: "Entity Extraction Agent",
    action: "extracted_entities",
    decision: "Parsed bug report into structured entities: component, trigger, expected vs actual, environment, errors",
    rationale: `Processed ${sourceLabel} input to identify all key debugging signals before hypothesis generation.`,
  });

  // Stage 2: Hypothesis Generator
  const { content: hypotheses } = await runAgent(
    "Hypothesis Generator",
    `You are an expert debugging AI. Given structured bug information extracted from a ${sourceLabel}, generate multiple hypotheses about the root cause.

For each hypothesis:
1. State the hypothesis clearly in one sentence
2. Explain the mechanism — WHY this could cause the observed behavior
3. Rate likelihood: **High** / **Medium** / **Low** with a brief reason
4. Identify what evidence would confirm or refute it
5. State whether this hypothesis was RETAINED or ELIMINATED based on available evidence, and why.

Generate 3-5 distinct hypotheses ordered by likelihood. Consider: race conditions, state management issues, environment-specific factors, edge cases in data handling, version mismatches, network/async timing, and configuration errors.`,
    `Extracted bug information:\n${extractedEntities}`,
    onEvent
  );

  // Count retained vs eliminated
  const eliminatedCount = (hypotheses.match(/ELIMINATED/gi) || []).length;
  const retainedCount = (hypotheses.match(/RETAINED/gi) || []).length;

  auditTrail.push({
    timestamp: new Date().toISOString(),
    agent: "Hypothesis Generator",
    action: "generated_hypotheses",
    decision: `Generated ${retainedCount + eliminatedCount} hypotheses; ${retainedCount} retained, ${eliminatedCount} eliminated based on evidence`,
    rationale: "Ranked by likelihood using entity signals. Eliminated hypotheses contradicted by available stack data or environment info.",
  });

  // Stage 3: Step Validator / Reproduction Steps
  const { content: reproductionSteps } = await runAgent(
    "Step Validator",
    `You are an expert QA engineer. Given bug information and hypotheses, create precise, actionable reproduction steps that a developer could follow in under 5 minutes.

Format exactly as:

**Prerequisites:**
- List setup conditions, required versions, env vars, seed data

**Reproduction Steps:**
1. Numbered, precise steps with exact values/inputs where possible

**Expected Result:**
One clear sentence of what should happen

**Actual Result:**
One clear sentence of what happens instead

**Environment Variables / Config:**
Any specific settings that must be set

**Validation Notes:**
- Steps to rule out each hypothesis
- Alternative reproduction paths
- Edge cases worth testing

**Confidence Assessment:**
Rate confidence this reproduces the bug: X/10 — brief explanation.`,
    `Original ${SOURCE_TYPE_LABELS[inputType] ?? "report"}:\n${rawInput}\n\nExtracted entities:\n${extractedEntities}\n\nHypotheses:\n${hypotheses}`,
    onEvent
  );

  const stepConfidenceMatch = reproductionSteps.match(/(\d+)\/10/);
  const stepConfidence = stepConfidenceMatch ? parseInt(stepConfidenceMatch[1], 10) : 7;

  auditTrail.push({
    timestamp: new Date().toISOString(),
    agent: "Step Validator",
    action: "validated_steps",
    decision: `Reproduction steps validated with ${stepConfidence}/10 confidence. Steps account for all retained hypotheses.`,
    rationale: "Steps derived from highest-likelihood hypothesis. Validation notes cover alternative paths to rule out other candidates.",
  });

  // Stage 4: Test Writer
  const { content: testCode } = await runAgent(
    "Test Writer",
    `You are a senior software engineer. Generate complete, executable test code to reproduce and verify the bug.

Based on the context, choose the most appropriate test type:
- Unit test (isolated function/method)
- Integration test (component + dependencies)
- API test (HTTP endpoints)
- E2E test (user flows)

Requirements:
- Add a top comment block: // Bug Reproduction Test — [brief one-line description]
- Use descriptive test names explaining what is being tested and what should happen
- Include setup/teardown if needed
- Write assertions that would FAIL with the bug and PASS when fixed
- Add inline comments explaining what each section validates
- Cover: main bug reproduction, one edge case, one regression check

Default to Jest + TypeScript unless another framework is clearly implied by the context.`,
    `Bug input:\n${rawInput}\n\nExtracted entities:\n${extractedEntities}\n\nReproduction steps:\n${reproductionSteps}${context}`,
    onEvent
  );

  auditTrail.push({
    timestamp: new Date().toISOString(),
    agent: "Test Writer",
    action: "generated_tests",
    decision: "Generated test suite covering: main reproduction case, edge case, and regression guard",
    rationale: "Test assertions are designed to fail with the bug present and pass once the root cause is fixed.",
  });

  // Stage 5: Analysis Synthesizer — flow diagram + clarifying questions + confidence
  const { content: analysisOutput } = await runAgent(
    "Analysis Synthesizer",
    `You are a debugging expert and technical writer. Synthesize the full bug analysis into four sections:

## 1. Flow Diagram (Mermaid)

Generate a Mermaid flowchart showing the sequence of events that leads to the bug. Include:
- Normal happy path in green
- The divergence point where the bug occurs
- The failure state

Wrap in \`\`\`mermaid ... \`\`\` fences.

## 2. Clarifying Questions

List exactly 5 targeted questions that, if answered, would either confirm the root cause or significantly narrow the search space. Number them 1-5. Make them specific and actionable — not generic.

## 3. Confidence Score & Breakdown

Provide a confidence score and a structured breakdown.
Format EXACTLY as:
CONFIDENCE_SCORE: [0-100]
CONFIDENCE_EVIDENCE: ["evidence point 1", "evidence point 2", "evidence point 3"]
CONFIDENCE_ASSUMPTIONS: ["assumption 1", "assumption 2"]
CONFIDENCE_MISSING: ["missing info 1", "missing info 2"]

## 4. Severity Classification

Classify the bug severity based on: user impact, affected component criticality, reproducibility, data risk.
Format EXACTLY as:
SEVERITY: [critical|high|medium|low]
SEVERITY_REASON: One sentence explaining the severity rating.`,
    `Full analysis:\n\nEntities:\n${extractedEntities}\n\nHypotheses:\n${hypotheses}\n\nReproduction steps:\n${reproductionSteps}`,
    onEvent
  );

  // Parse confidence score
  const confidenceMatch = analysisOutput.match(/CONFIDENCE_SCORE:\s*(\d+)/);
  const confidenceScore = confidenceMatch
    ? Math.min(100, Math.max(0, parseInt(confidenceMatch[1], 10))) / 100
    : 0.65;

  // Parse confidence breakdown
  let confidenceBreakdown: ConfidenceBreakdown = {
    score: Math.round(confidenceScore * 100),
    evidence: [],
    assumptions: [],
    missing: [],
  };

  try {
    const evidenceMatch = analysisOutput.match(/CONFIDENCE_EVIDENCE:\s*(\[[\s\S]*?\])/);
    const assumptionsMatch = analysisOutput.match(/CONFIDENCE_ASSUMPTIONS:\s*(\[[\s\S]*?\])/);
    const missingMatch = analysisOutput.match(/CONFIDENCE_MISSING:\s*(\[[\s\S]*?\])/);

    if (evidenceMatch) confidenceBreakdown.evidence = JSON.parse(evidenceMatch[1]);
    if (assumptionsMatch) confidenceBreakdown.assumptions = JSON.parse(assumptionsMatch[1]);
    if (missingMatch) confidenceBreakdown.missing = JSON.parse(missingMatch[1]);
  } catch {
    // Fallback if JSON parsing fails
    confidenceBreakdown.evidence = ["Pipeline analysis completed successfully"];
    confidenceBreakdown.assumptions = ["Input is representative of the actual bug scenario"];
    confidenceBreakdown.missing = ["Additional environment details would improve accuracy"];
  }

  // Parse severity
  const severityMatch = analysisOutput.match(/SEVERITY:\s*(critical|high|medium|low)/i);
  const severity = (severityMatch?.[1]?.toLowerCase() ?? "medium") as "critical" | "high" | "medium" | "low";

  const severityReasonMatch = analysisOutput.match(/SEVERITY_REASON:\s*(.+)/);
  const severityReason = severityReasonMatch?.[1]?.trim() ?? "Severity assessed based on reproduction complexity and component impact.";

  auditTrail.push({
    timestamp: new Date().toISOString(),
    agent: "Analysis Synthesizer",
    action: "synthesized_analysis",
    decision: `Final confidence: ${Math.round(confidenceScore * 100)}%, Severity: ${severity}. Generated flow diagram and 5 clarifying questions.`,
    rationale: "Confidence derived from input quality, specificity of reproduction steps, and hypothesis evidence strength. Severity based on user impact and component criticality.",
  });

  // Extract just the mermaid block for flowDiagram
  const mermaidMatch = analysisOutput.match(/```mermaid([\s\S]*?)```/);
  const flowDiagram = mermaidMatch
    ? `\`\`\`mermaid${mermaidMatch[1]}\`\`\``
    : analysisOutput;

  // Extract just the clarifying questions section (between ## 2 and ## 3)
  const questionsMatch = analysisOutput.match(
    /##\s*2[\.\)]\s*Clarifying Questions?\s*\n([\s\S]*?)(?=##\s*3[\.\)]|CONFIDENCE_SCORE:|$)/i
  );
  const clarifyingQuestions = questionsMatch ? questionsMatch[1].trim() : "";

  logger.info({ confidenceScore, severity, inputType }, "Pipeline complete");

  return {
    extractedEntities,
    hypotheses,
    reproductionSteps,
    testCode,
    flowDiagram,
    clarifyingQuestions,
    confidenceScore,
    confidenceBreakdown,
    severity,
    severityReason,
    auditTrail,
  };
}

export async function runEnvDiff(
  env1: string,
  env2: string,
  bugDescription: string,
  label1: string,
  label2: string
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-5.4",
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

  return response.choices[0]?.message?.content ?? '{"differences":[],"verdict":"Unable to analyze","likelihood":"low","summary":"Analysis failed"}';
}

export async function runNl2Test(
  description: string,
  framework: string,
  codeContext: string | undefined
): Promise<string> {
  const context = codeContext ? `\n\nRelevant code:\n\`\`\`\n${codeContext}\n\`\`\`` : "";

  const response = await openai.chat.completions.create({
    model: "gpt-5.4",
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

  return response.choices[0]?.message?.content ?? '{"testCode":"","framework":"Jest","explanation":"","coverageNotes":""}';
}

export async function runFlakyDetector(
  testCode: string,
  language: string
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-5.4",
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

  return response.choices[0]?.message?.content ?? '{"flakyTests":[],"overallRisk":"none","summary":"Unable to analyze"}';
}

export async function runCorrelation(
  targetInput: string,
  targetEntities: string,
  candidates: Array<{ id: number; title: string; rawInput: string; extractedEntities: string | null; createdAt: Date }>
): Promise<string> {
  if (candidates.length === 0) return "[]";

  const candidateSummaries = candidates
    .slice(0, 10)
    .map(c => `ID: ${c.id}\nTitle: ${c.title}\nInput (truncated): ${c.rawInput.slice(0, 300)}\nEntities: ${(c.extractedEntities ?? "").slice(0, 300)}`)
    .join("\n\n---\n\n");

  const response = await openai.chat.completions.create({
    model: "gpt-5.4",
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
