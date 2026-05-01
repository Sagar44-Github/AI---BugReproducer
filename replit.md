# Bug Reproduction Engine

## Overview

An AI-powered multi-agent bug reproduction engine that transforms vague bug reports into structured, verifiable debugging workflows. The system uses a pipeline of specialized AI agents (Entity Extraction → Hypothesis Generator → Step Validator → Test Writer → Analysis Synthesizer) to analyze bug reports and produce comprehensive debugging reports.

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
- **AI integration**: OpenAI via Replit AI Integrations (no API key required)
- **Build**: esbuild (CJS bundle for server)

## Key Features

1. **Multi-Agent Pipeline**: 5 specialized AI agents process bug reports sequentially:
   - Entity Extraction Agent: Parses structured information from raw input
   - Hypothesis Generator: Creates multiple possible root cause explanations
   - Step Validator: Produces precise, numbered reproduction steps
   - Test Writer: Generates executable test code
   - Analysis Synthesizer: Creates Mermaid flow diagrams, clarifying questions, and confidence scores

2. **Real-time SSE Streaming**: The pipeline streams agent output live via Server-Sent Events so users can watch each agent work in real-time

3. **Multiple Input Types**: Accepts raw text bug reports, GitHub issue URLs, and stack traces

4. **Optional Code Context**: Users can provide code snippets to get context-aware analysis

5. **Comprehensive Reports**: Tabbed output showing reproduction steps, test code, hypotheses, flow diagrams, and clarifying questions

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Architecture

### Frontend (artifacts/bug-engine)
- `src/pages/home.tsx` — Dashboard with stats and analyses list
- `src/pages/new.tsx` — New analysis form
- `src/pages/detail.tsx` — Analysis detail with real-time pipeline streaming

### Backend (artifacts/api-server)
- `src/routes/analyses.ts` — CRUD routes + SSE pipeline endpoint
- `src/lib/agents.ts` — Multi-agent pipeline orchestration using OpenAI

### Database (lib/db)
- `src/schema/analyses.ts` — Bug analyses table with all pipeline output fields

### API Contract (lib/api-spec)
- `openapi.yaml` — OpenAPI spec (source of truth)
- Generates React Query hooks in `lib/api-client-react`
- Generates Zod schemas in `lib/api-zod`

## Important Notes

- After codegen changes, `lib/api-zod/src/index.ts` must only export `./generated/api` (not `./generated/types` or `./generated/api.schemas` which may not exist)
- Confidence scores are stored as 0-1 decimals; multiply by 100 for percentage display
- The `/analyses/:id/run` endpoint returns SSE — use raw fetch, not the generated React Query hook
