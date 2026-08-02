# Bug Reproduction Engine

## Overview

An AI-powered multi-agent bug reproduction engine that transforms vague bug reports into structured, verifiable debugging workflows. Uses a 5-agent AI pipeline and a suite of standalone developer tools.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend framework**: React + Vite (artifacts/bug-engine, preview /)
- **API framework**: Express 5 (artifacts/api-server, preview /api)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **AI integration**: OpenAI via Replit AI Integrations (no API key required, uses gpt-5.4)
- **Build**: esbuild (CJS bundle for server)

## Pages & Routes

- `/` — Landing page (hero, features, how it works, CTA)
- `/dashboard` — Dashboard with stats, input type breakdown chart, recent analyses
- `/new` — New Analysis: 8 source type cards, GitHub auto-fetch, code context, tags
- `/analyses/:id` — Analysis Detail: real-time SSE pipeline, 8-tab results view
- `/analyses/:id/export` — Export/Report: markdown with copy + download + print
- `/history` — Analysis History: searchable + filterable table
- `/settings` — Settings: agent table, source types, tips
- `/tools/env-diff` — Environment Diff Detector
- `/tools/nl2test` — NL2Test: Natural Language to Test Case
- `/tools/flaky-detector` — Flaky Test Detector

## Feature Set

### Core Pipeline (5 agents, gpt-5.4)
1. **Entity Extraction Agent** — Parses bug input, identifies components, trigger, expected vs actual, environment
2. **Hypothesis Generator** — 3-5 ranked root cause theories, RETAINED/ELIMINATED with rationale
3. **Step Validator** — Precise numbered reproduction steps with confidence rating
4. **Test Writer** — Executable Jest/TypeScript test code covering main case, edge case, regression
5. **Analysis Synthesizer** — Mermaid flow diagram, 5 clarifying questions, confidence score + breakdown, severity classification

### Feature 1: Confidence Scoring with Explainability
- Each pipeline run produces a structured breakdown: evidence supporting the score, assumptions made, and missing information
- Stored as `confidence_breakdown` JSON in DB
- Shown as collapsible panel in detail page with green/amber/red indicators

### Feature 2: Multi-Bug Correlation Engine
- GET /api/analyses/:id/correlations — AI compares target bug against all completed analyses
- Returns similarity %, common factors, and historical root cause note
- Results cached in `correlations` column; shown in "Similar Bugs" tab

### Feature 3: Environment Diff Detector
- POST /api/tools/env-diff — AI compares two env configs (key=value or JSON)
- Classifies each difference: critical / likely / unlikely / irrelevant
- Returns verdict, likelihood, and per-diff reasoning
- UI at /tools/env-diff with labelled side-by-side inputs and sorted results

### Feature 4: Reproduction Session Collaboration
- POST /api/analyses/:id/annotations — Add note, verified, failed, or question annotation
- GET /api/analyses/:id/annotations — List all annotations
- GET /api/analyses/:id/collaborate — SSE stream for real-time annotation broadcast
- In-memory SSE client registry per analysisId; broadcasts to all connected devs
- "Team" tab in detail page with live collaborator count, annotation feed, and add form

### Feature 5: NL2Test — Natural Language to Test Case
- POST /api/tools/nl2test — Generates complete runnable test from plain English
- Supports 9 frameworks: Jest/TS, Jest/JS, Vitest, Mocha+Chai, Pytest, Cypress, Playwright, RSpec, JUnit
- Returns testCode, framework, explanation, coverageNotes
- UI at /tools/nl2test with framework selector, optional code context, copy button

### Feature 6: Flaky Test Detector
- POST /api/tools/flaky-detector — Detects flaky tests and categorizes by root cause
- 7 categories: race_condition, environment_dependency, non_deterministic_data, timing, external_dependency, state_leak, other
- Returns per-test risk level, explanation, and concrete fix suggestion
- UI at /tools/flaky-detector with overall risk badge and per-test cards

### Feature 7: Bug Severity Classifier
- Runs as part of the Analysis Synthesizer agent (no extra latency)
- Classifies: critical / high / medium / low with one-sentence rationale
- Stored as `severity` + `severity_reason` columns
- Shown as colored badge in analysis header and detail page

### Feature 8: Reproduction Audit Trail
- Every pipeline stage logs: timestamp, agent, action, decision, rationale
- Stored as `audit_trail` JSON array in DB
- "Audit Trail" tab in detail page shows a vertical timeline with per-agent entries

## Source Types (8)

1. `raw_text` — Plain English bug description
2. `github_url` — GitHub issue URL (auto-fetches title, body, comments)
3. `stack_trace` — Stack trace / error output
4. `jira_ticket` — Jira ticket description or URL
5. `sentry_event` — Sentry error event (URL, ID, or details)
6. `log_file` — Log file output around the time of failure
7. `curl_request` — Failed curl command or API request/response
8. `video_description` — Description of a screen recording

## API Routes

### Analyses
- `GET /api/analyses` — List (supports ?status, ?inputType, ?search)
- `POST /api/analyses` — Create
- `GET /api/analyses/:id` — Get full analysis
- `PATCH /api/analyses/:id` — Update title, tags, codeContext
- `DELETE /api/analyses/:id` — Delete
- `POST /api/analyses/:id/run` — SSE pipeline stream
- `GET /api/analyses/:id/export` — Markdown report
- `GET /api/analyses/:id/correlations` — AI similarity search
- `GET /api/analyses/:id/annotations` — List annotations
- `POST /api/analyses/:id/annotations` — Add annotation
- `GET /api/analyses/:id/collaborate` — SSE broadcast stream
- `GET /api/analyses/stats/summary` — Dashboard stats

### Tools
- `POST /api/tools/env-diff` — Environment config comparison
- `POST /api/tools/nl2test` — Natural language to test case
- `POST /api/tools/flaky-detector` — Flaky test detection

### Other
- `POST /api/github/fetch-issue` — Fetch GitHub issue content
- `GET /api/healthz` — Health check

## DB Schema

### `analyses` table
All original columns plus:
- `confidence_breakdown` text (JSON: {score, evidence[], assumptions[], missing[]})
- `severity` enum (critical | high | medium | low)
- `severity_reason` text
- `audit_trail` text (JSON array of AuditEntry)
- `correlations` text (JSON array of CorrelationMatch, cached)

### `collaboration_annotations` table
- id, analysis_id, author_name, type (note|verified|failed|question), step_ref, content, created_at

## BYOK / LLM Config

Provider config managed by `artifacts/api-server/src/lib/llmConfig.ts`:
- Stored in `.llm-config.json` (server root); falls back to env vars if absent
- Priority order: stored file → GROQ_API_KEY → OPENAI_API_KEY → AI_INTEGRATIONS_OPENAI_API_KEY
- All `openai.chat` calls in agents.ts use `getActiveClient()` + `getActiveModel()` — never a hardcoded singleton
- Settings routes: GET/POST `/api/settings/llm`, POST `/api/settings/llm/test`, POST `/api/settings/llm/reset`
- Supported providers: groq, openai, ollama (local, no key), custom (any OpenAI-compatible)

## Pages & Routes (updated)

- `/settings` — Settings: AI Provider (BYOK), agent table, source types, tips
- `/docs` — Full documentation: quick start, BYOK guide, pipeline, source types, tools, API reference

## Key Commands

- `pnpm run typecheck` — full typecheck
- `pnpm --filter @workspace/api-spec run codegen` — regenerate hooks + Zod schemas
- `pnpm --filter @workspace/db run push` — push DB schema (dev only)

## Important Notes

- Confidence scores stored as 0-1 decimals; display requires ×100
- SSE endpoints (/run, /collaborate) use raw fetch, not generated hooks
- GitHub fetch proxies to public GitHub API — private repos not supported
- The api-zod index.ts barrel is auto-fixed by the codegen script
- Correlation results are cached after first fetch (refresh button resets cache)
- Collaboration SSE uses in-memory Map — not persistent across server restarts
- LLM config is persisted to `.llm-config.json`; calling `invalidateClient()` forces client rebuild
