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
  const context = codeContext ? `\n\nRelevant code context:\n\`\`\`\n${codeContext}\n\`\`\`` : "";

  // Stage 1: Entity Extraction Agent
  const extractedEntities = await runAgent(
    "Entity Extraction Agent",
    `You are an expert bug analysis AI. Extract structured information from bug reports.
Identify and extract: 
- The affected component/system/file
- The triggering action or sequence of steps
- The expected behavior
- The observed/actual failure behavior
- Environment details (OS, browser, version, etc.)
- Any error messages or codes mentioned
- Relevant data or state conditions

Format your output as a clear, structured list with headers. Be concise and precise.`,
    `Bug Report (type: ${inputType}):\n${rawInput}${context}`,
    onEvent
  );

  // Stage 2: Hypothesis Generator
  const hypotheses = await runAgent(
    "Hypothesis Generator",
    `You are an expert debugging AI. Given extracted bug information, generate multiple hypotheses about the root cause.
For each hypothesis:
1. State the hypothesis clearly
2. Explain the mechanism (WHY this could cause the issue)
3. Rate likelihood: High/Medium/Low with a brief reason
4. Identify what evidence would confirm or refute it

Generate 3-5 distinct hypotheses ordered by likelihood. Think creatively about edge cases, race conditions, state management issues, and environment-specific factors.`,
    `Extracted bug information:\n${extractedEntities}`,
    onEvent
  );

  // Stage 3: Step Validator / Reproduction Steps
  const reproductionSteps = await runAgent(
    "Step Validator",
    `You are an expert QA engineer. Given bug information and hypotheses, create precise reproduction steps.
Format as:
**Prerequisites:**
- List setup conditions required

**Reproduction Steps:**
1. Numbered, precise steps to trigger the bug

**Expected Result:**
What should happen

**Actual Result:**
What happens instead

**Validation Notes:**
- Edge cases to try
- Steps to eliminate each hypothesis

**Confidence Assessment:**
Rate confidence this reproduces the bug: X/10 — explain why.`,
    `Original report:\n${rawInput}\n\nExtracted entities:\n${extractedEntities}\n\nHypotheses:\n${hypotheses}`,
    onEvent
  );

  // Stage 4: Test Writer
  const testCode = await runAgent(
    "Test Writer",
    `You are a senior software engineer. Generate executable test code to reproduce and verify the bug.
Based on the context, generate the most appropriate test type (unit, integration, or e2e).
Include:
- Descriptive test names
- Setup/teardown if needed
- Assertions that would catch the bug
- Comments explaining what each section tests
- Multiple test cases covering: main reproduction, edge cases, regression check

Use clear, idiomatic code. If the language/framework is unclear, default to Jest/TypeScript.
Add a comment block at the top: // Bug Reproduction Test — [brief description]`,
    `Bug report:\n${rawInput}\n\nExtracted entities:\n${extractedEntities}\n\nReproduction steps:\n${reproductionSteps}${context}`,
    onEvent
  );

  // Stage 5: Flow Diagram (Mermaid) + Clarifying Questions + Confidence Score
  const analysisOutput = await runAgent(
    "Analysis Synthesizer",
    `You are a debugging expert. Synthesize the full bug analysis into:

1. **Flow Diagram (Mermaid):** Generate a Mermaid flowchart showing the sequence of events leading to the bug. Use \`\`\`mermaid ... \`\`\` fences.

2. **Clarifying Questions:** List 3-5 targeted questions that would help confirm the root cause or improve reproduction accuracy. Number them.

3. **Confidence Score:** Provide an overall confidence score (0-100) that the reproduction steps will reproduce the bug. Format exactly as: CONFIDENCE_SCORE: [number]

Keep each section clearly labeled with the headers above.`,
    `Full analysis:\nEntities: ${extractedEntities}\n\nHypotheses: ${hypotheses}\n\nReproduction steps: ${reproductionSteps}`,
    onEvent
  );

  // Parse confidence score from analysis output
  const confidenceMatch = analysisOutput.match(/CONFIDENCE_SCORE:\s*(\d+)/);
  const confidenceScore = confidenceMatch ? Math.min(100, Math.max(0, parseInt(confidenceMatch[1], 10))) / 100 : 0.7;

  logger.info({ confidenceScore }, "Pipeline complete");

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
