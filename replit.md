# Bug Reproduction Engine

## Overview

An AI-powered multi-agent bug reproduction engine that transforms vague bug reports into structured, verifiable debugging workflows. The system uses a pipeline of 5 specialized AI agents to analyze bug reports and produce comprehensive debugging reports with reproduction steps, test code, flow diagrams, and confidence scores.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend framework**: React + Vite (artifacts/bug-engine)
- **API framework**: Express 5 (artifacts/api-server)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **AI integration**: OpenAI via Replit AI Integrations (no API key required, uses gpt-5.4)
- **Build**: esbuild (CJS bundle for server)

## Pages

- `/` — Landing page (hero, features, how it works, CTA)
- `/dashboard` — Dashboard with stats and recent analyses list + input type breakdown chart
- `/new` — New Analysis form with 8 source type cards, GitHub auto-fetch, code context, tags, auto-run toggle
- `/analyses/:id` — Analysis Detail with real-time pipeline streaming (SSE)
- `/analyses/:id/export` — Export/Report page: markdown report with copy + download + print
- `/history` — Analysis History: searchable + filterable table of all runs
- `/settings` — Settings & About: agent table, source type reference, tips

## Source Types (8)

1. `raw_text` — Plain English bug description
2. `github_url` — GitHub issue URL (auto-fetches title, body, comments via GitHub API)
3. `stack_trace` — Stack trace / error output
4. `jira_ticket` — Jira ticket description or URL
5. `sentry_event` — Sentry error event (URL, ID, or details)
6. `log_file` — Log file output around the time of failure
7. `curl_request` — Failed curl command or API request/response
8. `video_description` — Description of a screen recording

## Multi-Agent Pipeline (5 agents, all gpt-5.4)

1. **Entity Extraction Agent** — Parses the bug input, identifies components, actions, expected vs actual behavior, environment
2. **Hypothesis Generator** — Creates 3-5 ranked root cause theories with likelihood ratings and evidence criteria
3. **Step Validator** — Produces numbered, precise reproduction steps with prerequisites and confidence rating
4. **Test Writer** — Generates executable Jest/TypeScript test code with assertions that catch the bug
5. **Analysis Synthesizer** — Creates Mermaid flow diagrams, 5 clarifying questions, and an overall confidence score (0-100)

## Key Backend Routes

- `GET /api/analyses` — List analyses (supports ?status=, ?inputType=, ?search= filters)
- `POST /api/analyses` — Create analysis
- `GET /api/analyses/:id` — Get full analysis with all agent outputs
- `PATCH /api/analyses/:id` — Update title, tags, codeContext
- `DELETE /api/analyses/:id` — Delete analysis
- `POST /api/analyses/:id/run` — SSE stream: run the 5-agent pipeline
- `GET /api/analyses/:id/export` — Generate markdown report
- `GET /api/analyses/stats/summary` — Stats including byInputType breakdown
- `POST /api/github/fetch-issue` — Fetch a GitHub issue and return its content

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas (also auto-fixes api-zod barrel)
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Architecture

### Frontend (artifacts/bug-engine)
- `src/pages/landing.tsx` — Marketing landing page
- `src/pages/dashboard.tsx` — Dashboard with stats and analyses
- `src/pages/new.tsx` — New analysis form with 8 source types
- `src/pages/detail.tsx` — Analysis detail with real-time SSE pipeline
- `src/pages/export.tsx` — Export/printable report view
- `src/pages/history.tsx` — Searchable/filterable history
- `src/pages/settings.tsx` — Settings and about page

### Backend (artifacts/api-server)
- `src/routes/analyses.ts` — CRUD + SSE pipeline + export endpoint
- `src/routes/github.ts` — GitHub issue fetching proxy
- `src/lib/agents.ts` — 5-agent pipeline with source-type-specific prompts

### Database (lib/db)
- `src/schema/analyses.ts` — Bug analyses table with all 8 input types and all pipeline output fields

### API Contract (lib/api-spec)
- `openapi.yaml` — OpenAPI spec (source of truth)
- Codegen command auto-fixes api-zod/src/index.ts barrel to `export * from "./generated/api"`

## Important Notes

- Confidence scores are stored as 0-1 decimals; multiply by 100 for percentage display
- The `/analyses/:id/run` endpoint returns SSE — use raw fetch, not the generated React Query hook
- GitHub fetch endpoint proxies to GitHub's public API — private repos are not supported without a token
- The api-zod index.ts barrel is auto-fixed by the codegen script (printf command in api-spec/package.json)
