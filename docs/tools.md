# Developer Tools

BugRepro_Engine includes six standalone developer tools available at `/tools/*`. These tools are independent of the main bug reproduction pipeline — they don't create analysis records in the database and results are not persisted.

All tools call `POST /api/tools/<tool-name>` and return structured JSON.

---

## Tool 1 — Environment Diff Detector (`/tools/env-diff`)

### Purpose
Compare two environment configurations and identify which differences are relevant to a specific bug.

### When to use
- A bug only appears in production but not in development
- After a deployment that changed environment variables
- When debugging "works on my machine" issues

### Input format
The tool accepts environment configs in two formats:
- **Key=value pairs** (one per line): `NODE_ENV=production`
- **JSON object**: `{"NODE_ENV": "production", "PORT": "443"}`

### How the AI classifies differences
The LLM receives both configs, the bug description, and is asked to classify each difference into one of four categories:
- `critical` — this difference likely causes or directly contributes to the bug
- `likely` — may interact with the bug indirectly
- `unlikely` — probably unrelated but worth noting for completeness
- `irrelevant` — no plausible connection to this bug

### UI features
- Optional display labels for each environment ("Production" / "Development" instead of "A" / "B")
- Results sorted by criticality (critical differences shown first)
- Color-coded badges (red, orange, yellow, grey)
- Reasoning text for each difference explains the classification

### API call
```
POST /api/tools/env-diff
{
  "env1": "NODE_ENV=production\nDB_HOST=prod.internal",
  "env2": "NODE_ENV=development\nDB_HOST=localhost",
  "bugDescription": "Auth token validation fails silently",
  "label1": "Production",
  "label2": "Development"
}
```

---

## Tool 2 — NL2Test (`/tools/nl2test`)

### Purpose
Convert a plain English description of what a test should verify into complete, runnable test code.

### When to use
- You know what needs to be tested but don't know the framework syntax
- Writing tests for a bug fix before the fix exists (TDD for bug reports)
- Converting acceptance criteria into automated tests
- Getting a starting test structure that you'll refine

### Supported frameworks
| Framework | Language | Use case |
|-----------|----------|----------|
| Jest/TS | TypeScript | Most React/Node projects |
| Jest/JS | JavaScript | Older Node projects |
| Vitest | TypeScript | Vite-based projects |
| Mocha+Chai | JavaScript | Express, Node.js APIs |
| Pytest | Python | Python backend or scripting |
| Cypress | TypeScript | End-to-end browser tests |
| Playwright | TypeScript | Cross-browser E2E |
| RSpec | Ruby | Ruby on Rails |
| JUnit | Java | Java Spring, Android |

### Code context
Optionally paste existing code (a function, class, or component) — the AI will adapt the generated test to import from the right place and use the actual function signature.

### What the AI generates
- Complete test file with proper imports and setup
- Test suite wrapping (`describe` block or class)
- Main test case verifying the described behavior
- Additional edge cases inferred from the description
- Coverage notes explaining what else should be tested

### API call
```
POST /api/tools/nl2test
{
  "description": "Test that login fails when email is empty and shows an error message",
  "framework": "Jest",
  "codeContext": "export function handleLogin(email, password) { ... }"
}
```

---

## Tool 3 — Flaky Test Detector (`/tools/flaky-detector`)

### Purpose
Paste test code and get an analysis of which tests are likely to be flaky, why they fail intermittently, and how to fix them.

### When to use
- CI/CD pipeline has intermittently failing tests
- A test passes locally but fails on CI
- Tests pass individually but fail when run in parallel
- After a test suite has grown and started having reliability issues

### Flakiness categories
| Category | Common symptoms |
|----------|-----------------|
| `race_condition` | Test passes when run alone, fails in parallel |
| `environment_dependency` | Fails on CI (Linux) but passes on macOS |
| `non_deterministic_data` | Uses `Math.random()`, `new Date()`, or `uuid()` without seeding |
| `timing` | Uses `setTimeout(fn, 100)` or `sleep()` with fixed durations |
| `external_dependency` | Hits a real API, database, or file system |
| `state_leak` | A previous test modifies global state that this test reads |
| `other` | Doesn't fit the above |

### What you get per test
- **Risk level**: high / medium / low
- **Category**: one of the 7 categories above
- **Explanation**: why this specific test is flaky
- **Fix suggestion**: concrete recommendation (e.g. "Mock the fetch call with `jest.fn()`", "Use `jest.useFakeTimers()`")

### Overall risk
- **High**: Most tests are likely flaky
- **Medium**: Some tests have flakiness risks
- **Low**: Minor or theoretical risks
- **None**: No flakiness patterns detected

### API call
```
POST /api/tools/flaky-detector
{
  "testCode": "it('saves user', async () => { const user = await db.save(...); })",
  "language": "TypeScript"
}
```

---

## Tool 4 — Regression Guard (`/tools/regression-guard`)

### Purpose
Determine whether an existing test would have caught a regression introduced by specific code changes.

### When to use
- Before merging a code change — verify the test suite guards against regressions
- After a production bug — check if any test should have caught it
- Writing post-mortems — understand why the regression slipped through
- PR reviews — verify new tests actually cover the changed code

### How it works
The AI receives three inputs:
1. The test code (existing test or proposed test)
2. The code changes (diff/patch showing what changed)
3. A description of the bug that was introduced

The AI traces whether the test exercises the exact code path that was changed, and whether the changed behavior would cause the test to fail.

### Verdicts
| Verdict | Meaning |
|---------|---------|
| `would_catch` | The test exercises the changed code path and the new behavior would cause a failure |
| `would_miss` | The test doesn't cover the changed code path, or the change is in logic the test doesn't assert |
| `uncertain` | Cannot determine without actually executing the code |

### Output
- **Verdict** + **confidence** (high/medium/low)
- **Reasoning**: paragraph explaining the analysis
- **Critical lines**: specific lines from the diff that the test exercises
- **Missed scenarios**: test cases not covered that could hide the regression
- **Recommendation**: how to strengthen the test to make it a proper regression guard

### API call
```
POST /api/tools/regression-guard
{
  "testCode": "it('handles empty email', () => { expect(validate('')).toBe(false); })",
  "codeChanges": "- if (!email) return false;\n+ if (!email?.trim()) return false;",
  "bugDescription": "Whitespace-only emails are incorrectly accepted"
}
```

---

## Tool 5 — Image / Screenshot Analyzer (`/tools/image-analyze`)

> Note: This tool is exposed via the API at `POST /api/tools/image-analyze`. A dedicated frontend page is planned.

### Purpose
Extract structured bug information from a description of a screenshot, screen recording, or error dialog.

### Why description-based
The LLM (Groq Llama 3.3 70B) is a text model and cannot directly process images. However, users often have screenshots with visible error messages, stack traces, or UI states. This tool bridges the gap: the user describes what they see, and the tool extracts all bug-relevant information in a format that can be submitted directly to the main pipeline.

### What it extracts
- **`extractedText`**: All visible error messages, codes, exception text, stack traces
- **`uiState`**: What the UI looked like at the point of failure (buttons visible, forms, dialogs)
- **`visibleErrors`**: Specific error messages or codes as an array
- **`suggestedBugReport`**: A complete, well-structured bug report ready to paste into the New Analysis form
- **`inputType`**: The recommended input type for the generated bug report (e.g. `"stack_trace"` if a trace is visible)
- **`confidence`**: How reliable the extraction is based on the description quality

### Best practices for descriptions
- Include all visible text verbatim (especially error messages, codes, line numbers)
- Describe the UI state ("a white screen appeared", "a red error box showed up")
- Note what action was taken before the screenshot was taken
- Mention which page or screen the screenshot is from

### API call
```
POST /api/tools/image-analyze
{
  "imageDescription": "Screenshot shows TypeError: Cannot read property 'email' of undefined at UserService.ts:47. The page went white after clicking Submit.",
  "additionalContext": "This happened on the login page using Chrome on macOS"
}
```

---

## Tool 6 — Bug Digest (`/tools/bug-digest`)

> Note: This tool is exposed via the API at `POST /api/tools/bug-digest`. A dedicated frontend page is planned.

### Purpose
Generate an AI-powered executive summary of all bugs analysed during a specific time period. Useful for sprint retrospectives, engineering all-hands, or weekly engineering health reports.

### Periods
| Period value | What it covers |
|-------------|----------------|
| `"today"` | Last 24 hours |
| `"last_7_days"` | Last 7 days |
| `"last_30_days"` | Last 30 days |
| `"all_time"` | All 365 days |

### How it works
1. The route handler queries the DB for analyses created in the selected period
2. Extracts: ID, title, severity, status, inputType, confidenceScore, createdAt, autoTags
3. Summarizes up to 20 analyses in a text format and sends to the AI
4. The AI generates a comprehensive digest

### Output sections
- **Summary**: 2–3 sentence executive overview of the period
- **Highlights**: Key callouts (critical bugs, notable resolutions, trends)
- **Patterns**: Recurring root causes, common failure themes across analyses
- **Recommendations**: Actionable items for the engineering team
- **Top components**: Most frequently affected system areas
- **Risk level**: Overall team risk level for this period
- **Stats note**: Key numbers summarized

### When to use
- End of sprint retrospective
- Weekly engineering health review
- Post-incident analysis covering multiple related bugs
- Quarterly quality report

### API call
```
POST /api/tools/bug-digest
{
  "period": "last_7_days"
}
```

---

## Tool Architecture

All tools follow the same pattern:

```
Frontend form
    ↓
POST /api/tools/<name>         (tools.ts route handler)
    ↓
Input validation (Zod or manual)
    ↓
run<ToolName>()                (agents.ts standalone function)
    ↓
Groq LLM call (llama-3.3-70b-versatile)
    ↓
parseJson() helper              (strips markdown fences, extracts JSON)
    ↓
Response normalization
    ↓
JSON response to frontend
```

**`parseJson()` helper** (in `tools.ts`):
```typescript
function parseJson(raw: string): unknown {
  // 1. Strip markdown code fences (```json ... ```)
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) raw = fenced[1];

  // 2. Direct parse
  try { return JSON.parse(raw.trim()); } catch {}

  // 3. Extract first {...} block
  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch {} }

  // 4. Extract first [...] block
  const arrMatch = raw.match(/\[[\s\S]*\]/);
  if (arrMatch) { try { return JSON.parse(arrMatch[0]); } catch {} }

  throw new SyntaxError("No valid JSON found in response");
}
```

This is needed because LLMs occasionally wrap their JSON output in markdown code fences even when instructed not to.
