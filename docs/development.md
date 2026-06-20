# Development Guide

## Prerequisites

- Node.js 24 (managed by Replit's Nix environment)
- pnpm 9 (the only package manager used in this project — never `npm` or `yarn`)
- PostgreSQL database (provided by Replit)
- Groq API key (set as a Replit secret: `GROQ_API_KEY`)

---

## First-Time Setup

```bash
# 1. Install all workspace dependencies
pnpm install

# 2. Push the database schema (creates all tables)
pnpm --filter @workspace/db run push

# 3. Start both services (or use Replit workflows)
pnpm --filter @workspace/api-server run dev   # API at /api
pnpm --filter @workspace/bug-engine run dev   # Frontend at /
```

In Replit, both services are configured as **workflows** and start automatically.

---

## Commands Reference

### Workspace-level

```bash
# Full typecheck (builds libs, then checks artifacts)
pnpm run typecheck

# Typecheck only libs (faster — skips artifacts)
pnpm run typecheck:libs

# Build a specific package
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/bug-engine run build
```

### Database

```bash
# Push schema changes to the database (dev only)
pnpm --filter @workspace/db run push

# Generate migration SQL (for production/review)
pnpm --filter @workspace/db run generate

# Inspect current DB schema
pnpm --filter @workspace/db run studio
```

### API Codegen

```bash
# Regenerate React Query hooks and Zod schemas from OpenAPI spec
pnpm --filter @workspace/api-spec run codegen
```

Run this every time you change `lib/api-spec/openapi.yaml`. The command regenerates:
- `lib/api-client-react/src/` — React Query hooks
- `lib/api-zod/src/` — Zod request/response schemas

After running codegen, run `pnpm run typecheck` to verify no type errors.

### Individual packages

```bash
# Typecheck a specific package
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/bug-engine run typecheck
pnpm --filter @workspace/db run typecheck
```

---

## Environment Variables & Secrets

All secrets are managed through Replit's secret system. **Never hard-code secrets or commit them.**

| Variable | Where used | How to set |
|----------|-----------|-----------|
| `DATABASE_URL` | `lib/db`, `artifacts/api-server` | Auto-provided by Replit PostgreSQL integration |
| `GROQ_API_KEY` | `lib/integrations-openai-ai-server` | Replit Secrets panel → `GROQ_API_KEY` |
| `OPENAI_API_KEY` | `lib/integrations-openai-ai-server` | Replit AI Integrations (proxy key) |
| `SESSION_SECRET` | `artifacts/api-server` | Replit Secrets panel → `SESSION_SECRET` |
| `PORT` | Both services | Auto-assigned by Replit per artifact |
| `BASE_PATH` | Both services | Auto-assigned by Replit per artifact |

**Reading env vars in code:**
```typescript
// Server
const connectionString = process.env.DATABASE_URL;

// Frontend (Vite)
const apiBase = import.meta.env.VITE_API_BASE_URL;
```

---

## Adding a New API Endpoint

Follow the contract-first workflow:

### Step 1: Add to OpenAPI spec

Edit `lib/api-spec/openapi.yaml`:

```yaml
paths:
  /analyses/{id}/my-new-thing:
    post:
      operationId: myNewThing
      summary: Does a new thing
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: integer
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/MyNewThingBody'
      responses:
        '200':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MyNewThingResponse'

components:
  schemas:
    MyNewThingBody:
      type: object
      required: [someField]
      properties:
        someField:
          type: string
```

### Step 2: Run codegen

```bash
pnpm --filter @workspace/api-spec run codegen
```

This generates:
- `useMyNewThing()` hook in `lib/api-client-react/src/`
- `MyNewThingBody` Zod schema in `lib/api-zod/src/`

### Step 3: Implement the route handler

Add to the appropriate router file in `artifacts/api-server/src/routes/`:

```typescript
import { MyNewThingBody } from "@workspace/api-zod";

router.post("/analyses/:id/my-new-thing", async (req, res): Promise<void> => {
  const params = GetAnalysisParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const body = MyNewThingBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  // ... implementation
  res.json({ result: "..." });
});
```

### Step 4: Use in frontend

```typescript
import { useMyNewThing } from "@workspace/api-client-react";

const mutation = useMyNewThing();
mutation.mutate({ id: 42, someField: "value" });
```

### Step 5: Typecheck

```bash
pnpm run typecheck
```

---

## Adding a New Database Table

### Step 1: Define the table in `lib/db/src/schema/analyses.ts`

```typescript
import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const myNewTable = pgTable("my_new_things", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMyNewSchema = createInsertSchema(myNewTable).omit({
  id: true,
  createdAt: true,
});

export type MyNewThing = typeof myNewTable.$inferSelect;
export type InsertMyNewThing = z.infer<typeof insertMyNewSchema>;
```

### Step 2: Export from index

```typescript
// lib/db/src/schema/index.ts
export * from "./analyses";  // already exports everything from analyses.ts
```

If you add a new schema file, add it here.

### Step 3: Push to database

```bash
pnpm --filter @workspace/db run push
```

### Step 4: Use in route handlers

```typescript
import { db, myNewTable } from "@workspace/db";

const results = await db.select().from(myNewTable).where(eq(myNewTable.name, "example"));
```

---

## Adding a New Frontend Page

### Step 1: Create the page component

```typescript
// artifacts/bug-engine/src/pages/my-page.tsx
export function MyPage() {
  return <div>My new page</div>;
}
```

### Step 2: Add the route in `App.tsx`

```typescript
import { MyPage } from "@/pages/my-page";

// Inside Router() Switch:
<Route path="/my-page" component={MyPage} />
```

### Step 3: Add to navigation (if needed)

Edit `artifacts/bug-engine/src/components/layout.tsx`:

```typescript
const mainNav = [
  // ... existing items
  { href: "/my-page", label: "My Page", icon: SomeIcon },
];
```

Or add to the Tools dropdown:
```typescript
const toolsNav = [
  // ... existing tools
  { href: "/tools/my-tool", label: "My Tool", icon: SomeIcon },
];
```

---

## Adding a New AI Agent

### Step 1: Define the Zod schema

Add to `artifacts/api-server/src/lib/agentSchemas.ts`:

```typescript
export const MyAgentSchema = z.object({
  outputField: z.string().min(1, "outputField is required"),
  // ... other fields
});

export type MyAgentOutput = z.infer<typeof MyAgentSchema>;

export const MY_AGENT_SCHEMA_HINT = `{
  "outputField": "string — description of what this should contain"
}`;
```

### Step 2: Import in agents.ts

```typescript
import {
  // ... existing imports
  MyAgentSchema,
  MY_AGENT_SCHEMA_HINT,
  type MyAgentOutput,
} from "./agentSchemas";
```

### Step 3: Add to the pipeline

Inside `runBugReproductionPipeline()`:

```typescript
const t0_my = Date.now();
const myData: MyAgentOutput = await runValidatedAgent(
  "My Agent",
  MyAgentSchema,
  `System prompt: ${MY_AGENT_SCHEMA_HINT}`,
  `User prompt with context: ${entityData.component}...`,
  onEvent
);
const myMs = Date.now() - t0_my;

auditTrail.push({
  timestamp: new Date().toISOString(),
  agent: "My Agent",
  action: "did_something",
  durationMs: myMs,
  decision: `Generated ${myData.outputField}`,
  rationale: "Because the analysis needed this",
});
```

### Step 4: Add to PipelineResult type

```typescript
export type PipelineResult = {
  // ... existing fields
  myOutput: string;
};
```

### Step 5: Add to DB set in analyses.ts

In the `POST /analyses/:id/run` handler:
```typescript
await db.update(analysesTable).set({
  // ... existing fields
  myOutput: result.myOutput,
}).where(eq(analysesTable.id, params.data.id));
```

---

## Logging

**Never use `console.log` in server code.**

```typescript
// In route handlers — use req.log
req.log.info({ analysisId: 42 }, "Pipeline started");
req.log.error({ err }, "Pipeline failed");

// In library code — use the singleton logger
import { logger } from "./logger";
logger.info({ duration: 1500 }, "Agent completed");
logger.warn({ err }, "Non-critical agent failed");
```

Pino logs are structured JSON with:
- `level`: `"info"`, `"warn"`, `"error"`, `"debug"`
- `msg`: the log message string
- Additional key-value pairs as context

---

## Monorepo Conventions

### Package naming
All packages use the `@workspace/` prefix:
- `@workspace/db`
- `@workspace/api-server`
- `@workspace/bug-engine`
- `@workspace/api-client-react`
- `@workspace/api-zod`

### Dependency rules
- `artifacts/*` packages declare their own deps; they don't share with each other
- Root `package.json` is only for repo-level tooling (TypeScript, ESLint, etc.)
- If a dependency is in the catalog (`pnpm-workspace.yaml`), use `"catalog:"` not a version

### Import paths
- Cross-workspace: `import { db } from "@workspace/db"`
- Within an artifact: `import { Button } from "@/components/ui/button"` (alias configured in Vite/tsconfig)
- Never: `import { db } from "../../../lib/db/src/index"` (relative paths across packages)

### TypeScript rules
- Strict mode everywhere (from `tsconfig.base.json`)
- No `any` — use `unknown` and type guards
- No `console.log` in server code (enforced by convention, not linter)
- All route handlers must have explicit return types and handle all `Promise<void>` returns

---

## Common Problems

### "No valid JSON found in response"
The LLM returned markdown-fenced JSON or non-JSON text. The `parseJson()` helper in `tools.ts` handles most cases. If an agent fails validation twice, check the schema hints — the LLM may need more explicit formatting instructions.

### "Cannot find module '@workspace/db'"
Run `pnpm run typecheck:libs` to rebuild lib declarations. Missing `@workspace/db` exports usually mean stale lib declarations.

### "Column does not exist" in production
The DB schema was updated locally with `pnpm --filter @workspace/db run push` but the production database hasn't been updated. Run the push command against the production DATABASE_URL.

### "PORT already in use"
Hard-coded port number in a service. All services must read `PORT` from `process.env.PORT`. Check the `vite.config.ts` or `src/index.ts` for hard-coded ports.

### TypeScript errors after codegen
After running codegen, the barrel `lib/api-zod/src/index.ts` may have duplicate exports. The codegen script auto-fixes this — if it persists, check `lib/api-spec/scripts/fix-barrel.ts`.

### Mermaid diagram not rendering
The `flowDiagram` string may contain invalid syntax. Check if any node IDs contain hyphens (not allowed — only alphanumeric + underscore). The diagram generator (`diagramGenerator.ts`) sanitizes IDs, but raw LLM output can still occasionally sneak through invalid IDs if the schema validation passes but the Mermaid renderer rejects them.

---

## Deployment

This project is deployed via Replit's built-in deployment system.

**To deploy:**
1. Click "Deploy" in the Replit interface (or use `suggest_deploy` tool)
2. Replit builds both services using esbuild (API) and Vite (frontend)
3. Both services are deployed behind the same proxy at the production domain
4. The production database is a separate PostgreSQL instance from dev

**Build commands (run automatically on deploy):**
```bash
# API server
pnpm --filter @workspace/api-server run build
# → esbuild bundles src/index.ts → dist/index.cjs

# Frontend
pnpm --filter @workspace/bug-engine run build
# → Vite builds to dist/
```

**Production environment:**
- `NODE_ENV=production`
- `PORT` assigned by Replit
- `DATABASE_URL` points to the production PostgreSQL instance
- Same secrets as dev (Replit secrets are shared across dev/prod by default)

**Schema in production:**
The production database is not automatically migrated on deploy. After a schema change, connect to the production DATABASE_URL and run:
```bash
DATABASE_URL=<production-url> pnpm --filter @workspace/db run push
```
