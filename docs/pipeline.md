# AI Pipeline

## Overview

The pipeline is a sequential chain of 7 AI agents plus a deterministic confidence scorer. All agents use **Groq's `llama-3.3-70b-versatile`** model via an OpenAI-compatible client (`lib/integrations-openai-ai-server`).

The pipeline is implemented in `artifacts/api-server/src/lib/agents.ts` and called by the `POST /api/analyses/:id/run` SSE route handler.

```
Input (raw bug text + input type)
  │
  ▼
Agent 1: Entity Extraction
  │
  ▼
Agent 2: Hypothesis Generator
  │
  ▼
Agent 3: Step Validator
  │
  ▼
Agent 4: Test Writer
  │    ↓ (syntax validation)
  │  [server-side syntax check]
  │    ↓ (if invalid → re-run Test Writer with error feedback)
  ▼
Agent 5: Analysis Synthesizer
  │    ↓ (deterministic confidence scoring)
  │  [calculateConfidenceScore()]
  │    ↓ (deterministic Mermaid generation)
  │  [generateMermaidFromDiagram()]
  ▼
Agent 6: Fix Suggester
  ▼
Agent 7: Auto-Tagger
  │
  ▼
Store all results in DB → emit pipeline_done
```

**Total latency**: typically 45–90 seconds for a complex bug report (7 sequential LLM calls, each taking 5–15 seconds).

---

## Agent Runner (`runAgent`)

Every agent call goes through the same low-level `runAgent()` function, which handles:

1. **Rate limit (HTTP 429)**: emits `rate_limit` event, waits for `Retry-After` header duration, retries once
2. **First timeout**: emits `timeout` event, waits 10 seconds, retries once
3. **Second timeout**: throws `AgentTimeoutError`

Each agent also goes through `runValidatedAgent()` (wraps `runAgent`), which:

1. Parses the LLM output as JSON
2. Validates against the agent's Zod schema
3. On first validation failure: feeds the Zod error messages back to the LLM as a correction request and retries once
4. On second validation failure: throws `AgentValidationError`

**`max_completion_tokens`**: `8192` for all agents.

---

## Agent 1 — Entity Extraction

**Purpose**: Parse the raw bug report and extract all structured entities.

**System prompt key points**:
- Identifies the affected component and module
- Extracts the trigger action (what the user does)
- Separates expected behavior from actual behavior
- Parses environment (OS, browser, runtime, version)
- Lists all error messages verbatim
- Classifies frequency (always / intermittent / rare / unknown)
- Adapts analysis based on `inputType` (stack traces get different treatment than log files)

**Input**: Raw bug report text + source-type-specific hint (e.g. "Pay attention to the call chain from top to bottom")

**Zod schema** (`EntityExtractionSchema`):
```typescript
{
  component: string;              // min 1 char
  triggerAction: string;          // min 1 char
  expectedBehavior: string;       // min 1 char
  actualBehavior: string;         // min 1 char
  environment: {
    os?: string;
    browser?: string;
    runtime?: string;
    version?: string;
    other?: string;
  };
  errorMessages: string[];
  frequency: "always" | "intermittent" | "rare" | "unknown";
  additionalContext?: string;
}
```

**Audit trail entry**: Records component name, trigger action, frequency, environment summary, and error message count.

---

## Agent 2 — Hypothesis Generator

**Purpose**: Generate 3–5 ranked root-cause hypotheses and determine which are retained vs. eliminated.

**System prompt key points**:
- Must produce between 3 and 5 hypotheses (never fewer, never more)
- Each hypothesis must explain the mechanism — not just state a vague theory
- Must classify each as `"retained"` or `"eliminated"` with a specific `statusReason`
- Likelihood (`high` / `medium` / `low`) reflects probability before full investigation
- Uses entity data (errorMessages, environment, frequency) to build and eliminate hypotheses

**Input**: Entity extraction output from Agent 1

**Zod schema** (`HypothesesSchema`):
```typescript
{
  hypotheses: [{
    id: string;
    title: string;
    mechanism: string;
    likelihood: "high" | "medium" | "low";
    confirmingEvidence: string[];
    refutingEvidence: string[];
    status: "retained" | "eliminated";
    statusReason: string;
  }]   // min 1, max 5
}
```

**Audit trail entry**: Records how many hypotheses were retained vs. eliminated and which one is the top candidate.

---

## Agent 3 — Step Validator

**Purpose**: Produce precise, numbered reproduction steps that a developer can follow exactly.

**System prompt key points**:
- Steps must be specific and executable (no vague instructions like "try submitting")
- Each step includes an `expectedOutcome` — what should happen at that step in a working system
- `prerequisites` list things needed before starting (package versions, account state, feature flags, etc.)
- `validationNotes` call out uncertainties or cases where behavior may differ
- `confidenceRating` (1–10) reflects how confident the agent is that these steps reproduce the bug
- Uses both entity data and retained hypotheses to construct steps

**Input**: Entity extraction + hypotheses output

**Zod schema** (`StepValidationSchema`):
```typescript
{
  prerequisites: string[];
  steps: [{
    number: number;      // positive integer
    action: string;
    expectedOutcome?: string;
  }];                    // min 1 step
  expectedResult: string;
  actualResult: string;
  environmentConfig: string[];
  validationNotes: string[];
  confidenceRating: number;    // 1–10
}
```

**Audit trail entry**: Records step count, prerequisite count, confidence rating, and key steps.

---

## Agent 4 — Test Writer

**Purpose**: Write executable test code that, when run, proves the bug exists (and will fail if the bug is fixed).

**System prompt key points**:
- Defaults to Jest/TypeScript unless `frameworkHint` overrides it
- Writes 3 test cases: main reproduction case, edge case, and regression guard
- Must be runnable code — no placeholder functions, no pseudo-code
- Framework detection considers `codeContext` (detects Pytest if Python is visible, etc.)
- 9 supported frameworks: Jest/TS, Jest/JS, Vitest, Mocha+Chai, Pytest, Cypress, Playwright, RSpec, JUnit

**Input**: All prior agent outputs + optional `frameworkHint` + `codeContext`

**Zod schema** (`TestWriterSchema`):
```typescript
{
  framework: string;
  language: string;
  testCode: string;          // min 10 chars — must be actual code
  description: string;
  coverageAreas: string[];   // min 1
}
```

**Post-validation syntax check** (`syntaxValidator.ts`):
After Agent 4 validates against its Zod schema, the server runs a **language-specific syntax check** on the test code:

- **TypeScript/JavaScript**: Uses Node.js VM `new Script()` — catches syntax errors without executing
- **Python**: Pipes through `python3 -c "import ast; ast.parse(stdin)"` — no temp file
- **Other languages**: Returns `status: "unchecked"` (no validator available)

If syntax validation fails, the server **automatically re-runs Agent 4** with the syntax error as feedback. This means Test Writer may make up to 2 LLM calls total.

`testSyntaxStatus` result:
- `"verified"` — passed syntax check
- `"warning"` — failed syntax check (shown to user as "review before running")
- `"unchecked"` — language not supported for syntax checking

**Audit trail entry**: Records framework, language, coverage areas, and syntax validation result.

---

## Agent 5 — Analysis Synthesizer

**Purpose**: Generate the flow diagram, clarifying questions, severity classification, and confidence evidence/assumptions.

**System prompt key points**:
- Diagram must use the structured JSON schema (not raw Mermaid — that would be fragile)
- `failureNodeId` must be a valid node ID that exists in the `nodes` array
- Node IDs: alphanumeric + underscore only, must start with a letter or `_` — no hyphens, spaces, or dots
- Severity classification must be grounded in the actual impact and frequency
- 5 clarifying questions targeting the most information-missing areas
- `confidenceEvidence` and `confidenceAssumptions` are fed to the deterministic confidence scorer

**Input**: All prior agent outputs

**Zod schema** (`SynthesizerSchema`):
```typescript
{
  diagram: {
    title: string;           // max 65 chars
    nodes: [{
      id: string;            // /^[a-zA-Z_][a-zA-Z0-9_]*$/
      label: string;         // max 55 chars
      type: "start" | "step" | "failure" | "end" | "eliminated";
      stateChange?: string;  // max 70 chars
    }];                      // 3–20 nodes
    edges: [{
      from: string;
      to: string;
      label?: string;        // max 45 chars
      isAlternate: boolean;  // true = dashed line (eliminated path)
    }];                      // min 2 edges
    failureNodeId: string;
  };
  clarifyingQuestions: string[];   // exactly 5
  confidenceEvidence: string[];    // min 1
  confidenceAssumptions: string[];  // min 1
  severity: "critical" | "high" | "medium" | "low";
  severityReason: string;
}
```

**Post-validation: Mermaid generation** (`diagramGenerator.ts`):
After Zod validation, the diagram JSON is converted to Mermaid syntax deterministically by `generateMermaidFromDiagram()`:
- Node types map to Mermaid shapes: `start` → stadium `([ ])`, `step` → rectangle `[ ]`, `failure` → hexagon `{{ }}`, `end` → rounded `( )`, `eliminated` → dotted/grey
- `isAlternate: true` edges render as dashed lines (`-.->`)
- Node IDs are sanitized (hyphens stripped, `"end"` prefixed with `_` since it's a Mermaid reserved keyword)
- Labels are truncated and special characters escaped

**Post-validation: Confidence scoring** (`confidenceScoring.ts`):
The `calculateConfidenceScore()` function evaluates the bug report against a fixed rubric (not LLM-generated):

| Criterion | Max Points | What earns it |
|-----------|-----------|---------------|
| `environment` | 20 | OS, browser, runtime, or version specified |
| `frequency` | 15 | Reproduction frequency known (always/intermittent/rare) |
| `stack_trace` | 25 | Stack trace or exception trace present |
| `expected_behavior` | 15 | Expected outcome clearly stated |
| `similar_bug` | 20 | Similar historical bug found before pipeline ran |
| `code_snippet` | 10 | Code context or snippet attached |
| `reproduction_steps` | 15 | Partial steps given by user in original report |

Raw max = 120; capped at 100. The `missing` array lists all criteria that scored 0 — shown in the UI as "what would improve this score".

**Audit trail entry**: Records diagram complexity (node/edge count, failure node), severity, confidence evidence/assumptions, and total pipeline duration so far.

---

## Agent 6 — Fix Suggester

**Purpose**: Generate 3–5 concrete, actionable code fixes ranked by likelihood of resolving the root cause.

**System prompt key points**:
- Only suggests fixes for **retained** hypotheses — never for eliminated ones
- `codeLocation` must be specific (function name, class, file path)
- `effort` is time-based: `low` < 2 hours, `medium` = half day to 1 day, `high` = multiple days or architectural change
- Fix descriptions must be actionable — no vague advice like "add error handling"
- Non-critical: if this agent fails (e.g. timeout), the pipeline continues and `fix_suggestions` is stored as `"[]"`

**Input**: Entity extraction + retained hypotheses + validated steps + severity

**Zod schema** (`FixSuggesterSchema`):
```typescript
{
  suggestions: [{
    rank: number;               // 1–5, 1 = most recommended
    title: string;
    description: string;
    codeLocation: string;       // e.g. "UserService.getProfile() in src/services/user.ts"
    effort: "low" | "medium" | "high";
    confidence: "high" | "medium" | "low";
  }];    // 1–5 items
  summary: string;              // one-sentence summary of recommended approach
}
```

**Audit trail entry**: Records suggestion count, top suggestion title and location, effort level. If the agent was skipped due to failure, records `action: "skipped"`.

---

## Agent 7 — Auto-Tagger

**Purpose**: Generate 3–8 short taxonomy tags for classification, search, and filtering.

**Implementation**: Does not use `runValidatedAgent` — uses the simpler `runAgent` and parses with a regex to extract the JSON array. If parsing fails, `auto_tags` is stored as `"[]"`.

**System prompt**: Outputs ONLY a JSON array of lowercase hyphenated strings.

**Post-processing**:
- Tags are lowercased
- Non-alphanumeric/hyphen characters are replaced with `-`
- Consecutive hyphens are collapsed
- Leading/trailing hyphens are trimmed
- Truncated to 30 characters max
- Maximum 10 tags stored

**Example output**: `["null-reference", "async-race", "auth", "jwt", "token-refresh"]`

---

## Confidence Scorer (`confidenceScoring.ts`)

The confidence score is **never generated by the LLM**. It is computed deterministically based on what information was present in the original bug report.

```typescript
export function calculateConfidenceScore(
  entityData: EntityExtractionOutput,
  rawInput: string,
  codeContext: string | null,
  hasSimilarBugs: boolean
): ScoredConfidence
```

The function:
1. Checks each rubric criterion against the extracted entity data and raw input
2. Awards points per criterion (0 or the max weight — binary, no partial credit)
3. Sums all points, caps at 100
4. Returns which criteria were `missing` (scored 0) for display in the UI

**Storage**: Stored as `0–1` decimal in `confidence_score` column. Frontend multiplies by 100 for display.

---

## Diagram Generator (`diagramGenerator.ts`)

Takes the validated `DiagramOutput` JSON from Agent 5 and produces Mermaid flowchart syntax.

```typescript
export function generateMermaidFromDiagram(diagram: DiagramOutput): string
```

**Node shapes by type:**
- `start` → `(["▶ Label"])` — stadium shape
- `step` → `["Label<br/>state change"]` — rectangle with optional state change text
- `failure` → `{{"⚠ Label"}}` — hexagon  
- `end` → `("✕ Label")` — rounded rectangle
- `eliminated` → `["~ Label"]` — rectangle with `~` prefix (styled grey via CSS class)

**Edge styles:**
- `isAlternate: false` → `-->` (solid line, primary path)
- `isAlternate: true` → `-.->` (dashed line, eliminated hypothesis branch)

---

## Audit Trail

Every agent pushes an `AuditEntry` to the `auditTrail` array. This is stored as JSON in `analyses.audit_trail` and displayed in the "Audit Trail" tab of the detail page.

```typescript
{
  timestamp: string;      // ISO 8601, moment the agent completed
  agent: string;          // "Entity Extraction", "Hypothesis Generator", etc.
  action: string;         // "extracted_entities", "generated_hypotheses", etc.
  decision: string;       // human-readable summary
  rationale: string;      // why this decision was made
  durationMs?: number;    // agent duration in ms
  details?: AuditDetail[]; // key-value rows for the timeline UI
}
```

The UI renders the audit trail as a vertical timeline with color-coded status indicators (green = ok, amber = warn, blue = info, red = error).

---

## Error Handling

| Error Type | Cause | Behavior |
|-----------|-------|----------|
| `AgentValidationError` | Agent returned invalid JSON twice | Pipeline fails, status = `"failed"`, user told to retry or simplify input |
| `AgentTimeoutError` | LLM took > 30s twice | Pipeline fails, status = `"failed"`, user told to try again |
| Rate limit (429) | Too many concurrent calls | Automatically waited and retried once |
| Fix Suggester failure | Any error in Agent 6 | Non-fatal — pipeline continues, `fix_suggestions` = `"[]"` |
| Auto-Tagger failure | Any error in Agent 7 | Non-fatal — pipeline continues, `auto_tags` = `"[]"` |

---

## Standalone Tool Functions

In addition to the pipeline, `agents.ts` exports several standalone functions used by the `/tools/*` routes:

| Function | Description |
|----------|-------------|
| `runEnvDiff()` | Compare two env configs, classify differences by bug relevance |
| `runNl2Test()` | Convert natural language to test code in any of 9 frameworks |
| `runFlakyDetector()` | Detect flaky tests and categorize by root cause (7 categories) |
| `runCorrelation()` | Find semantically similar bugs in a list of historical analyses |
| `runRegressionGuard()` | Determine if a test would catch a regression from code changes |
| `runImageAnalyze()` | Extract bug info from a screenshot/recording description |
| `runBugDigest()` | Generate an AI digest summary of a period's bug activity |
| `runMultiEnvMatrix()` | Predict bug reproduction across multiple environment configs |
