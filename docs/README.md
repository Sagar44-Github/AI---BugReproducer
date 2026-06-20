# BugRepro_Engine — Complete Project Documentation

> AI-powered multi-agent bug reproduction engine. Transforms vague bug reports into structured, verifiable debugging workflows using a 7-agent AI pipeline and a suite of standalone developer tools.

---

## Table of Contents

| File | What it covers |
|------|---------------|
| [architecture.md](./architecture.md) | Monorepo layout, tech stack, service routing, build system |
| [database.md](./database.md) | Every table, column, type, constraint, and relationship |
| [api.md](./api.md) | Every API route — method, path, request body, response shape, errors |
| [pipeline.md](./pipeline.md) | The 7-agent AI pipeline — each agent's prompt, schema, inputs, outputs |
| [frontend.md](./frontend.md) | Every page, component, hook, routing, and state management detail |
| [features.md](./features.md) | All 8 features explained end-to-end with data flow |
| [tools.md](./tools.md) | Six standalone developer tools — how they work and how to call them |
| [development.md](./development.md) | Dev workflow, commands, codegen, secrets, deployment |

---

## What This Project Does

BugRepro_Engine takes any form of bug report — raw text, GitHub issue URL, stack trace, Jira ticket, Sentry event, log file, curl request, video description, screenshot description, or performance profile — and runs it through a 7-agent AI pipeline that produces:

1. **Structured entity extraction** — component, trigger, expected vs actual, environment, error messages
2. **Ranked root-cause hypotheses** — 3–5 theories with retained/eliminated status and evidence
3. **Validated reproduction steps** — numbered steps, prerequisites, environment config, confidence rating
4. **Executable test code** — Jest/TypeScript (or other framework) with syntax validation
5. **Flow diagram** — Mermaid flowchart showing the exact execution path where the bug occurs
6. **AI fix suggestions** — 3–5 ranked concrete code fixes with location, effort, and confidence
7. **Auto-tags** — 3–8 taxonomy tags for classification and search
8. **Clarifying questions** — 5 questions to gather missing information
9. **Confidence score** — deterministic 0–100 rubric (not LLM-generated)
10. **Severity classification** — critical / high / medium / low with rationale
11. **Audit trail** — full timestamped log of every agent's decision

All results are stored in PostgreSQL and displayed in a React frontend with real-time Server-Sent Events streaming.

---

## Quick Start

```bash
# Install all workspace dependencies
pnpm install

# Push database schema
pnpm --filter @workspace/db run push

# Start API server (runs on $PORT, proxied at /api)
pnpm --filter @workspace/api-server run dev

# Start frontend (runs on $PORT, proxied at /)
pnpm --filter @workspace/bug-engine run dev

# Full typecheck
pnpm run typecheck

# Regenerate API hooks + Zod schemas from OpenAPI spec
pnpm --filter @workspace/api-spec run codegen
```

---

## High-Level Architecture

```
Browser
  └── React + Vite (artifacts/bug-engine)  ← preview at /
        │
        │  REST + SSE  (all via /api/*)
        ▼
  Express 5 API (artifacts/api-server)      ← preview at /api
        │
        ├── PostgreSQL via Drizzle ORM (lib/db)
        ├── OpenAI-compatible client → Groq (llama-3.3-70b-versatile)
        └── 7-agent pipeline (lib/agents.ts)
```

The Replit shared proxy routes `/api/*` to the API server and `/*` to the frontend. Both services read the `PORT` environment variable.

---

## Environment Variables / Secrets

| Name | Required | Description |
|------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `GROQ_API_KEY` | Yes | Groq API key (Llama 3.3 70B) |
| `OPENAI_API_KEY` | Yes | Passed through Replit AI Integrations proxy |
| `SESSION_SECRET` | Yes | Express session secret |

---

## Key Design Decisions

- **Contract-first API**: OpenAPI spec in `lib/api-spec` drives Orval codegen for React Query hooks and Zod validators — the frontend never writes raw fetch calls for CRUD operations.
- **SSE for streaming**: Pipeline progress is streamed via Server-Sent Events. The frontend uses raw `EventSource` (not generated hooks) because SSE is not a REST operation.
- **Deterministic confidence score**: The confidence score is computed by a rubric function (`confidenceScoring.ts`), not hallucinated by the LLM. LLMs provide the evidence and assumptions; the score is a weighted sum.
- **Structured diagram output**: The LLM outputs a JSON diagram schema; Mermaid syntax is generated deterministically by `diagramGenerator.ts` — no LLM-generated Mermaid syntax (which is fragile).
- **Agent retry on validation failure**: Each agent has two attempts. On the first failure the agent receives its Zod validation errors as feedback and tries again. On the second failure an `AgentValidationError` is thrown and the pipeline fails cleanly.
- **Groq via OpenAI-compatible client**: The `lib/integrations-openai-ai-server` package wraps the Groq endpoint using the OpenAI SDK. No vendor lock-in — switching models is a one-line change.
