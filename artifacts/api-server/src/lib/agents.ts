import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";

export type AgentEvent = {
  type: "agent_start" | "agent_output" | "agent_done" | "pipeline_done" | "error";
  agentName: string;
  content: string;
};

export type PipelineResult = {
  extractedEntities: string;
  hypotheses: string;
  reproductionSteps: string;
  testCode: string;
  flowDiagram: string;
  clarifyingQuestions: string;
  confidenceScore: number;
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
): Promise<string> {
  onEvent({ type: "agent_start", agentName, content: `Starting ${agentName}...` });

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

  onEvent({ type: "agent_done", agentName, content: `${agentName} complete.` });
  return fullContent;
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

  // Stage 1: Entity Extraction Agent
  const extractedEntities = await runAgent(
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

  // Stage 2: Hypothesis Generator
  const hypotheses = await runAgent(
    "Hypothesis Generator",
    `You are an expert debugging AI. Given structured bug information extracted from a ${sourceLabel}, generate multiple hypotheses about the root cause.

For each hypothesis:
1. State the hypothesis clearly in one sentence
2. Explain the mechanism — WHY this could cause the observed behavior
3. Rate likelihood: **High** / **Medium** / **Low** with a brief reason
4. Identify what evidence would confirm or refute it

Generate 3-5 distinct hypotheses ordered by likelihood. Consider: race conditions, state management issues, environment-specific factors, edge cases in data handling, version mismatches, network/async timing, and configuration errors.`,
    `Extracted bug information:\n${extractedEntities}`,
    onEvent
  );

  // Stage 3: Step Validator / Reproduction Steps
  const reproductionSteps = await runAgent(
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

  // Stage 4: Test Writer
  const testCode = await runAgent(
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

  // Stage 5: Analysis Synthesizer — flow diagram + clarifying questions + confidence
  const analysisOutput = await runAgent(
    "Analysis Synthesizer",
    `You are a debugging expert and technical writer. Synthesize the full bug analysis into three sections:

## 1. Flow Diagram (Mermaid)

Generate a Mermaid flowchart showing the sequence of events that leads to the bug. Include:
- Normal happy path in green
- The divergence point where the bug occurs
- The failure state

Wrap in \`\`\`mermaid ... \`\`\` fences.

## 2. Clarifying Questions

List exactly 5 targeted questions that, if answered, would either confirm the root cause or significantly narrow the search space. Number them 1-5. Make them specific and actionable — not generic.

## 3. Confidence Score

Provide a final confidence score based on: quality of input, specificity of reproduction steps, and strength of evidence.
Format exactly as: CONFIDENCE_SCORE: [0-100]
Then one sentence explaining the score.`,
    `Full analysis:\n\nEntities:\n${extractedEntities}\n\nHypotheses:\n${hypotheses}\n\nReproduction steps:\n${reproductionSteps}`,
    onEvent
  );

  // Parse confidence score
  const confidenceMatch = analysisOutput.match(/CONFIDENCE_SCORE:\s*(\d+)/);
  const confidenceScore = confidenceMatch
    ? Math.min(100, Math.max(0, parseInt(confidenceMatch[1], 10))) / 100
    : 0.65;

  logger.info({ confidenceScore, inputType }, "Pipeline complete");

  return {
    extractedEntities,
    hypotheses,
    reproductionSteps,
    testCode,
    flowDiagram: analysisOutput,
    clarifyingQuestions: analysisOutput,
    confidenceScore,
  };
}
