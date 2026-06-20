# API Reference

All routes are mounted under the `/api` prefix via the Replit proxy. The Express server handles paths starting with `/api/...`.

Base URL (dev): `https://<replit-domain>/api`

---

## Analyses

### `GET /api/analyses`

List all analyses, with optional filtering.

**Query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `status` | `"pending" \| "running" \| "completed" \| "failed"` | Filter by pipeline status |
| `inputType` | one of 10 input type values | Filter by source type |
| `search` | string | Case-insensitive search on `title` |

**Response `200`:**
```json
[
  {
    "id": 42,
    "title": "Login page crashes on empty email",
    "inputType": "raw_text",
    "status": "completed",
    "severity": "high",
    "confidenceScore": 0.78,
    "tags": "auth,frontend",
    "autoTags": "[\"null-reference\",\"form-validation\",\"auth\"]",
    "resolutionStatus": "open",
    "createdAt": "2025-01-15T10:30:00.000Z",
    "updatedAt": "2025-01-15T10:35:00.000Z"
  }
]
```

---

### `POST /api/analyses`

Create a new analysis (does not run the pipeline — call `/run` separately).

**Request body:**
```json
{
  "title": "Login page crashes on empty email",
  "inputType": "raw_text",
  "rawInput": "When I submit the login form with an empty email...",
  "codeContext": "function handleSubmit(e) { ... }",
  "tags": "auth,frontend",
  "projectId": 1
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `title` | Yes | Display name |
| `inputType` | Yes | One of 10 source type values |
| `rawInput` | Yes | Full bug report text |
| `codeContext` | No | Code snippet for context |
| `tags` | No | Comma-separated user tags |
| `projectId` | No | Link to a project |

**Response `201`:** Full analysis object (all pipeline fields null, status = `"pending"`)

---

### `GET /api/analyses/:id`

Fetch a single analysis with all pipeline results.

**Response `200`:** Full analysis object including all JSON pipeline fields.

**Response `404`:** `{ "error": "Analysis not found" }`

---

### `PATCH /api/analyses/:id`

Update editable fields (title, tags, codeContext).

**Request body** (all optional):
```json
{
  "title": "Updated title",
  "tags": "auth,critical",
  "codeContext": "function handleSubmit..."
}
```

**Response `200`:** Updated analysis object.

---

### `DELETE /api/analyses/:id`

Delete an analysis and all its annotations.

**Response `204`:** No content.

---

### `POST /api/analyses/:id/run`

**SSE endpoint** — runs the 7-agent pipeline and streams progress events.

**Request body** (optional):
```json
{ "frameworkHint": "Pytest" }
```

`frameworkHint` overrides the auto-selected test framework for the Test Writer agent.

**Response headers:**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no
```

**Event stream format:**
```
data: {"type":"agent_start","agentName":"Entity Extraction","content":"Extracting entities..."}

data: {"type":"agent_output","agentName":"Entity Extraction","content":"...partial output..."}

data: {"type":"agent_validated","agentName":"Entity Extraction","content":"Entities extracted and validated."}

data: {"type":"agent_retry","agentName":"Hypothesis Generator","content":"Validation failed, retrying..."}

data: {"type":"pipeline_done","agentName":"System","content":"Pipeline completed successfully."}

data: {"type":"error","agentName":"Entity Extraction","content":"Agent returned unexpected response..."}
```

**Event types:**

| Type | When emitted |
|------|-------------|
| `agent_start` | Agent begins its LLM call |
| `agent_output` | Partial streaming content from the LLM |
| `agent_done` | LLM call complete, starting Zod validation |
| `agent_validated` | Zod validation passed |
| `agent_retry` | First attempt failed validation, retrying with error feedback |
| `pipeline_done` | All agents succeeded, DB updated |
| `error` | Unrecoverable agent failure (shown to user) |
| `rate_limit` | Hit Groq rate limit, waiting and retrying |
| `timeout` | LLM call timed out, retrying once |

**On `pipeline_done`**: The full analysis is updated in DB. Frontend should invalidate its TanStack Query cache for this analysis ID.

---

### `GET /api/analyses/:id/export`

Generate a markdown export report for the analysis.

**Response `200`:**
```json
{
  "markdown": "# Bug Report: Login page crashes...\n\n## Summary\n...",
  "title": "Login page crashes on empty email"
}
```

**Response `409`:** `{ "error": "Analysis must be completed to export" }`

---

### `GET /api/analyses/:id/correlations`

Find similar bugs in the database using AI semantic analysis. Results are **cached** in the `correlations` column after the first call.

**Query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `refresh` | `"true"` | Force re-run the AI comparison (clears cache) |

**Response `200`:**
```json
[
  {
    "id": 15,
    "title": "Auth token not refreshed on expiry",
    "similarity": 87,
    "commonFactors": ["JWT handling", "async race condition", "auth middleware"],
    "rootCauseNote": "That bug was caused by missing token refresh — same pattern.",
    "createdAt": "2025-01-10T08:00:00.000Z"
  }
]
```

**Response `404`:** Analysis not found  
**Response `409`:** Analysis must be completed first

---

### `POST /api/analyses/:id/resolve`

Mark an analysis as resolved (or update its resolution status).

**Request body:**
```json
{
  "resolutionStatus": "fixed",
  "resolvedBy": "alice",
  "fixDescription": "Added null check before email validation in handleSubmit()"
}
```

| Field | Required | Values |
|-------|----------|--------|
| `resolutionStatus` | Yes | `"open"` \| `"in_progress"` \| `"fixed"` \| `"verified_fixed"` \| `"wont_fix"` |
| `resolvedBy` | No | Name or identifier |
| `fixDescription` | No | Description of the fix |

**Response `200`:** Updated analysis object.

---

### `POST /api/analyses/:id/multi-env`

Run a multi-environment reproduction matrix — the AI predicts whether the bug would reproduce in each listed environment.

**Request body:**
```json
{
  "environments": [
    { "name": "Production", "config": "Node 18, PostgreSQL 14, Ubuntu 22.04, env=production" },
    { "name": "Development", "config": "Node 20, PostgreSQL 15, macOS 14, env=development" },
    { "name": "CI", "config": "Node 20, PostgreSQL 14, Ubuntu 22.04, env=test" }
  ]
}
```

**Minimum 2 environments required.**

**Response `200`:**
```json
{
  "matrix": [
    {
      "environment": "Production",
      "reproduces": "yes",
      "confidence": "high",
      "reasoning": "The missing null check would trigger in all environments since no env-specific guard exists.",
      "keyDifference": "N/A — this is code-level, not environment-specific"
    },
    {
      "environment": "Development",
      "reproduces": "yes",
      "confidence": "high",
      "reasoning": "Same code path, same bug.",
      "keyDifference": "N/A"
    }
  ],
  "isolationVerdict": "Bug reproduces everywhere — not environment-specific.",
  "recommendation": "Debug in Development for fastest iteration. Bug is code-level, not infrastructure."
}
```

---

### `GET /api/analyses/:id/annotations`

List all team annotations for an analysis.

**Response `200`:**
```json
[
  {
    "id": 1,
    "analysisId": 42,
    "authorName": "alice",
    "type": "verified",
    "stepRef": "3",
    "content": "Confirmed — step 3 triggers the crash every time.",
    "createdAt": "2025-01-15T11:00:00.000Z"
  }
]
```

---

### `POST /api/analyses/:id/annotations`

Add a team annotation.

**Request body:**
```json
{
  "authorName": "alice",
  "type": "verified",
  "stepRef": "3",
  "content": "Confirmed — step 3 triggers the crash every time."
}
```

| Field | Required | Values |
|-------|----------|--------|
| `authorName` | Yes | Display name |
| `type` | Yes | `"note"` \| `"verified"` \| `"failed"` \| `"question"` |
| `stepRef` | No | Step number reference |
| `content` | Yes | Annotation text |

**Response `201`:** Created annotation object.

---

### `GET /api/analyses/:id/collaborate`

**SSE endpoint** — real-time collaboration stream. Every annotation added via `POST /annotations` is broadcast to all connected clients.

**Response headers:** Same as `/run` SSE headers.

**Events:** Each event is an `annotation` event with the full annotation object as JSON.

**Notes:**
- The SSE client registry is in-memory — not persisted across server restarts
- Connects maintain a counter shown as "live collaborators" in the Team tab

---

### `GET /api/analyses/stats/summary`

Dashboard summary statistics.

**Response `200`:**
```json
{
  "total": 48,
  "completed": 41,
  "running": 2,
  "failed": 3,
  "pending": 2,
  "avgConfidence": 0.71,
  "byInputType": [
    { "inputType": "raw_text", "count": 20 },
    { "inputType": "stack_trace", "count": 12 }
  ]
}
```

---

### `GET /api/analyses/trends`

Time-series data for dashboard trend charts.

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `days` | integer | `30` | Number of days to look back |

**Response `200`:**
```json
[
  {
    "date": "2025-01-15",
    "total": 5,
    "completed": 4,
    "critical": 1,
    "high": 2,
    "medium": 1,
    "low": 0,
    "avgConfidence": 0.73
  }
]
```

---

### `POST /api/analyses/:id/regenerate-test`

Regenerate the test code for a completed analysis with a different framework.

**Request body:**
```json
{ "framework": "Pytest" }
```

**Response `200`:**
```json
{
  "testCode": "def test_login_empty_email():\n    ...",
  "testSyntaxStatus": "verified"
}
```

---

## Projects

### `GET /api/projects`

List all projects.

**Response `200`:** Array of project objects.

---

### `POST /api/projects`

Create a project.

**Request body:**
```json
{
  "name": "Auth Service",
  "description": "All auth-related bugs",
  "defaultFramework": "Jest",
  "slackWebhookUrl": "https://hooks.slack.com/services/...",
  "discordWebhookUrl": "https://discord.com/api/webhooks/..."
}
```

**Response `201`:** Created project object.

---

### `GET /api/projects/:id`

Fetch a single project.

**Response `200`:** Project object.

---

### `PATCH /api/projects/:id`

Update project fields (all optional).

**Response `200`:** Updated project object.

---

### `DELETE /api/projects/:id`

Delete a project.

**Response `204`:** No content.

---

## Tools

### `POST /api/tools/env-diff`

Compare two environment configurations and classify differences by relevance to a bug.

**Request body:**
```json
{
  "env1": "NODE_ENV=production\nDB_HOST=prod-db.internal\nPORT=443",
  "env2": "NODE_ENV=development\nDB_HOST=localhost\nPORT=3000",
  "bugDescription": "User authentication fails silently in production",
  "label1": "Production",
  "label2": "Development"
}
```

**Response `200`:**
```json
{
  "verdict": "Environment mismatch likely contributes to the bug",
  "likelihood": "high",
  "differences": [
    {
      "key": "NODE_ENV",
      "value1": "production",
      "value2": "development",
      "classification": "critical",
      "reasoning": "Auth middleware behaves differently in production mode"
    }
  ]
}
```

---

### `POST /api/tools/nl2test`

Convert a natural language test description into executable test code.

**Request body:**
```json
{
  "description": "Test that login fails when email is empty and shows an error message",
  "framework": "Jest",
  "codeContext": "function handleSubmit(e) { ... }"
}
```

**Supported frameworks:** `Jest/TS`, `Jest/JS`, `Vitest`, `Mocha+Chai`, `Pytest`, `Cypress`, `Playwright`, `RSpec`, `JUnit`

**Response `200`:**
```json
{
  "testCode": "describe('Login', () => {\n  it('fails with empty email', () => {\n    ...\n  });\n});",
  "framework": "Jest",
  "explanation": "Tests the empty email validation case...",
  "coverageNotes": "Also covers: null email, undefined email"
}
```

---

### `POST /api/tools/flaky-detector`

Detect flaky tests and categorize by root cause.

**Request body:**
```json
{
  "testCode": "it('should save user', async () => { await db.save(user); expect(user.id).toBeDefined(); })",
  "language": "TypeScript"
}
```

**Response `200`:**
```json
{
  "flakyTests": [
    {
      "name": "should save user",
      "riskLevel": "high",
      "category": "external_dependency",
      "explanation": "Depends on real DB — fails if DB is slow or unavailable",
      "fixSuggestion": "Mock the DB layer or use an in-memory test database"
    }
  ],
  "overallRisk": "high",
  "summary": "1 of 1 tests are highly flaky due to external dependency"
}
```

**Flakiness categories:** `race_condition`, `environment_dependency`, `non_deterministic_data`, `timing`, `external_dependency`, `state_leak`, `other`

---

### `POST /api/tools/regression-guard`

Analyze whether a test would catch a regression introduced by specific code changes.

**Request body:**
```json
{
  "testCode": "it('handles empty email', () => { expect(validateEmail('')).toBe(false); })",
  "codeChanges": "- if (!email) return false;\n+ if (!email || email.length === 0) return false;",
  "bugDescription": "Login crashes when email is empty"
}
```

**Response `200`:**
```json
{
  "verdict": "would_catch",
  "confidence": "high",
  "reasoning": "The test explicitly tests empty string, which is exactly what the change handles.",
  "criticalLines": ["if (!email) return false;"],
  "missedScenarios": ["whitespace-only email", "null vs undefined distinction"],
  "recommendation": "Add tests for whitespace-only and null inputs to make this a complete regression guard"
}
```

---

### `POST /api/tools/image-analyze`

Extract structured bug information from a screenshot or screen recording description.

**Request body:**
```json
{
  "imageDescription": "Screenshot shows a white screen with a red error box saying 'TypeError: Cannot read property of undefined' at line 47. The browser console shows a stack trace pointing to auth.js.",
  "additionalContext": "This happens on the login page after clicking Submit"
}
```

**Response `200`:**
```json
{
  "extractedText": "TypeError: Cannot read property of undefined at line 47 in auth.js",
  "uiState": "Login page showing a white screen with a red error box",
  "visibleErrors": ["TypeError: Cannot read property of undefined"],
  "suggestedBugReport": "When submitting the login form, a TypeError occurs at auth.js:47...",
  "inputType": "stack_trace",
  "confidence": "high"
}
```

---

### `POST /api/tools/bug-digest`

Generate an AI-powered digest summary of bugs over a time period.

**Request body:**
```json
{ "period": "last_7_days" }
```

**Period values:** `"today"`, `"last_7_days"`, `"last_30_days"`, `"all_time"`

**Response `200`:**
```json
{
  "summary": "7 bugs analysed this week, dominated by auth failures and async race conditions.",
  "highlights": [
    { "title": "3 Critical Bugs", "detail": "All related to authentication", "type": "critical" },
    { "title": "High Resolution Rate", "detail": "71% of bugs resolved", "type": "info" }
  ],
  "patterns": ["Auth middleware is the most common failure point", "Race conditions in async handlers"],
  "recommendations": ["Add integration tests for auth flows", "Audit all setTimeout usages"],
  "topComponents": ["AuthService", "UserController", "TokenRefresher"],
  "riskLevel": "high",
  "statsNote": "3 critical, 2 high, 2 medium. 5 resolved, 2 open."
}
```

---

### `POST /api/tools/run-code`

Execute code in a sandboxed environment.

**Request body:**
```json
{
  "code": "console.log('hello')",
  "language": "JavaScript"
}
```

**Response `200`:**
```json
{
  "output": "hello",
  "exitCode": 0,
  "duration": 12
}
```

---

## GitHub Integration

### `POST /api/github/fetch-issue`

Fetch a GitHub issue's content by URL (title, body, comments). Proxies to the public GitHub API — **private repos are not supported**.

**Request body:**
```json
{ "url": "https://github.com/owner/repo/issues/123" }
```

**Response `200`:**
```json
{
  "title": "Login crashes on empty email",
  "body": "Steps to reproduce:\n1. Navigate to /login\n2. Leave email empty...",
  "comments": ["Confirmed on v2.3.1", "Happens in Firefox too"],
  "labels": ["bug", "auth", "high-priority"]
}
```

---

## Health

### `GET /api/healthz`

Health check.

**Response `200`:** `{ "status": "ok" }`

---

## Error Responses

All errors follow this shape:

```json
{ "error": "Human-readable error message" }
```

| Status | Meaning |
|--------|---------|
| `400` | Bad request — missing or invalid fields |
| `404` | Resource not found |
| `409` | Conflict — e.g. analysis not completed yet |
| `500` | Internal server error — pipeline failure or unexpected exception |
