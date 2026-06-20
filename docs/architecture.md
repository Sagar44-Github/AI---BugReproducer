# Architecture

## Monorepo Structure

```
workspace/
├── artifacts/                  # Deployable services
│   ├── bug-engine/             # React + Vite frontend (preview /)
│   │   ├── src/
│   │   │   ├── pages/          # One file per route
│   │   │   ├── components/     # Shared UI components
│   │   │   ├── contexts/       # React context providers
│   │   │   ├── hooks/          # Custom hooks
│   │   │   └── App.tsx         # Router + providers
│   │   ├── index.html
│   │   └── vite.config.ts
│   │
│   ├── api-server/             # Express 5 API (preview /api)
│   │   ├── src/
│   │   │   ├── routes/         # Express routers, one per resource
│   │   │   ├── lib/            # Business logic (agents, scoring, etc.)
│   │   │   └── index.ts        # Server entry point
│   │   └── tsconfig.json
│   │
│   └── mockup-sandbox/         # Vite dev server for canvas mockups
│
├── lib/                        # Shared TypeScript packages (composite, emit declarations)
│   ├── db/                     # Drizzle ORM schema + client (@workspace/db)
│   ├── api-spec/               # OpenAPI YAML + Orval codegen config
│   ├── api-client-react/       # Generated React Query hooks (@workspace/api-client-react)
│   ├── api-zod/                # Generated Zod request/response schemas (@workspace/api-zod)
│   ├── integrations-openai-ai-server/   # Server-side OpenAI-compatible client
│   ├── integrations-openai-ai-react/    # React hooks for streaming completions
│   └── integrations/           # Other integration helpers
│
├── scripts/                    # Utility scripts (@workspace/scripts)
├── docs/                       # This documentation folder
├── pnpm-workspace.yaml         # Workspace config, catalog pins, overrides
├── tsconfig.base.json          # Shared strict TypeScript defaults
├── tsconfig.json               # Root solution file (libs only)
└── package.json                # Root task scripts
```

---

## Tech Stack

### Frontend (`artifacts/bug-engine`)
| Technology | Version | Role |
|-----------|---------|------|
| React | 18 | UI framework |
| Vite | 5 | Build tool + dev server |
| TypeScript | 5.9 | Type safety |
| Wouter | 3 | Client-side routing (lightweight alternative to React Router) |
| TanStack Query | 5 | Server state, caching, generated React Query hooks |
| Tailwind CSS | 3 | Utility-first CSS |
| shadcn/ui | latest | Component library built on Radix UI |
| Recharts | 2 | Charts (dashboard trends, confidence breakdown) |
| Mermaid | 10 | Flow diagram rendering in detail page |
| date-fns | 3 | Date formatting throughout the app |
| lucide-react | latest | Icon library |

### Backend (`artifacts/api-server`)
| Technology | Version | Role |
|-----------|---------|------|
| Node.js | 24 | Runtime |
| Express | 5 | HTTP framework |
| TypeScript | 5.9 | Type safety |
| Drizzle ORM | 0.41 | Database ORM + query builder |
| `pg` | 8 | PostgreSQL driver |
| Zod | 3 | Request validation (generated schemas from `@workspace/api-zod`) |
| Pino | 9 | Structured JSON logging |

### AI / LLM
| Technology | Role |
|-----------|------|
| Groq API | LLM inference provider |
| `llama-3.3-70b-versatile` | The model used for all 7 agents |
| OpenAI SDK | Client library (Groq is OpenAI-API-compatible) |
| `lib/integrations-openai-ai-server` | Replit-managed proxy wrapping Groq |

### Database
| Technology | Role |
|-----------|------|
| PostgreSQL | Primary data store |
| Drizzle ORM | Schema definition, type-safe queries |
| Drizzle Kit | Schema migrations + `push` command |
| `drizzle-zod` | Auto-generates Zod insert schemas from Drizzle table definitions |

### Toolchain
| Technology | Role |
|-----------|------|
| pnpm 9 | Package manager + workspace orchestrator |
| Orval | Generates React Query hooks + Zod schemas from OpenAPI YAML |
| esbuild | Bundles the API server into a CJS bundle for production |
| `tsc --build` | Incremental composite builds for shared libs |

---

## Service Routing (Proxy)

Replit runs a shared reverse proxy that routes traffic by path prefix. Each artifact declares its paths in `.replit-artifact/artifact.toml`:

```
Browser → https://<replit-domain>/
  ├── /api/*   → api-server (local port assigned by $PORT)
  └── /*       → bug-engine  (local port assigned by $PORT)
```

**Rules:**
- Paths are matched most-specific-first, so `/api` never conflicts with `/`
- Paths are **not** rewritten — `GET /api/analyses` hits the Express router at exactly `/api/analyses`
- Both services read `PORT` from the environment; hard-coding port numbers breaks the proxy
- In application code, use relative URLs. The proxy handles both dev previews and production domains

---

## TypeScript Project References

```
tsconfig.json (root solution file)
  └── references:
        ├── lib/db
        ├── lib/api-spec
        ├── lib/api-client-react
        ├── lib/api-zod
        └── lib/integrations-openai-ai-server

Artifacts (leaf packages — never in root references):
  ├── artifacts/bug-engine     (references lib/api-client-react, lib/db)
  └── artifacts/api-server     (references lib/db, lib/api-zod, lib/integrations-openai-ai-server)
```

- **Lib packages** are `composite: true` and emit `.d.ts` declarations via `tsc --build`
- **Artifact packages** are checked with `tsc --noEmit` only (no emit — Vite/esbuild handle bundling)
- Running `pnpm run typecheck` builds libs first, then checks artifacts

---

## API Contract Flow (Codegen)

```
lib/api-spec/openapi.yaml
        │
        │  pnpm --filter @workspace/api-spec run codegen
        ▼
lib/api-client-react/src/   ← React Query hooks (useGetAnalysis, useCreateAnalysis, …)
lib/api-zod/src/            ← Zod schemas for request bodies (CreateAnalysisBody, …)
```

The API server imports from `@workspace/api-zod` to validate incoming requests.
The frontend imports from `@workspace/api-client-react` for all data fetching.
This ensures a single source of truth: the OpenAPI spec.

---

## Request Lifecycle (typical GET)

```
1. User navigates to /analyses/42
2. Wouter renders <AnalysisDetail id={42} />
3. Component calls useGetAnalysis(42) hook (from @workspace/api-client-react)
4. TanStack Query checks cache → cache miss → sends GET /api/analyses/42
5. Express router matches GET /analyses/:id
6. Route handler validates :id with GetAnalysisParams (Zod schema)
7. Drizzle: SELECT * FROM analyses WHERE id = 42
8. Handler returns JSON; TanStack Query caches and delivers to component
```

## Request Lifecycle (pipeline SSE)

```
1. User clicks "Run Pipeline" on /analyses/42
2. Frontend opens EventSource to /api/analyses/42/run
3. Express SSE handler:
   a. Sets Content-Type: text/event-stream
   b. Marks analysis status = "running" in DB
   c. Calls runBugReproductionPipeline() which runs 7 agents sequentially
   d. Each agent emits agent_start / agent_output / agent_done / agent_validated events
   e. On success: stores all results in DB, emits pipeline_done
   f. On failure: marks status = "failed", emits error event
4. Frontend receives events, updates UI in real time
5. On pipeline_done, frontend invalidates TanStack Query cache for this analysis
```

---

## Logging

The server uses Pino for structured JSON logging:
- **Route handlers**: `req.log.info(...)` / `req.log.error(...)`
- **Library code**: singleton `logger` imported from `./lib/logger`
- `console.log` is **never used** in server code

Log levels: `error` for pipeline failures, `warn` for non-critical agent failures (Fix Suggester, Auto-Tagger), `info` for pipeline completion, `debug` for dev-only traces.
