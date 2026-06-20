---
name: OpenAPI-first type safety
description: How to correctly add new DB columns so generated frontend types reflect them
---

When new columns are added to the Drizzle schema, the following sequence is required before the frontend `BugAnalysisFull` type (or any other generated type) will include them:

1. Update `lib/db/src/schema/analyses.ts` (or relevant schema file) with the new column(s)
2. Run `pnpm --filter @workspace/db run push` to migrate the actual DB
3. Update `lib/api-spec/openapi.yaml` — add the new fields to the relevant schema objects (e.g. `BugAnalysisFull`, `BugAnalysis`, `CreateAnalysisBody`)
4. Run `pnpm --filter @workspace/api-spec run codegen` to regenerate hooks + Zod schemas + rebuild libs

**Why:** The OpenAPI spec is the source of truth for generated types, not the Drizzle schema. Even if Drizzle columns exist, the TypeScript types in `@workspace/api-client-react` and `@workspace/api-zod` only update when codegen runs against the YAML.

**How to apply:** Any time you add a column to the DB that the frontend reads — do ALL four steps. Missing step 3 or 4 causes TypeScript errors like `Property 'X' does not exist on type 'BugAnalysisFull'`.
