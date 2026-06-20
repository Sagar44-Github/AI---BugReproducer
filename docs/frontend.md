# Frontend

## Overview

The frontend is a React + Vite single-page application located in `artifacts/bug-engine/`. It uses Wouter for routing, TanStack Query for server state, shadcn/ui for components, and Tailwind CSS for styling.

All API calls for standard CRUD operations use generated React Query hooks from `@workspace/api-client-react`. SSE streams (pipeline, collaboration) use raw `EventSource`/`fetch`.

---

## Routing (`App.tsx`)

```
/                          LandingPage      — Hero, features overview, CTA
/dashboard                 Dashboard        — Stats, charts, recent analyses
/new                       NewAnalysis      — 8-source-type input form
/analyses/:id              AnalysisDetail   — Full results with 8 tabs
/analyses/:id/export       ExportPage       — Rendered report + download
/history                   History          — Searchable/filterable table
/settings                  Settings         — Agent config, source types, tips
/tools/env-diff            EnvDiffPage      — Environment diff detector
/tools/nl2test             Nl2TestPage      — NL-to-test generator
/tools/flaky-detector      FlakyDetectorPage — Flaky test detector
```

**Router provider**: Wouter `<WouterRouter base={import.meta.env.BASE_URL}>` — the `BASE_URL` is the Replit proxy path (`/`). This is critical: Vite sets `BASE_URL` from `base` in `vite.config.ts`, and Wouter strips it so routes work correctly when served at a path prefix.

**Providers wrapping the router** (outermost to innermost):
```
QueryClientProvider        ← TanStack Query cache + devtools
  TooltipProvider          ← Radix UI tooltip context
    NotificationsProvider  ← In-memory notification list (pipeline done/failed)
      WouterRouter         ← base path stripping
        AppLayout          ← Header nav + main content area
          Router (Switch)  ← Route matching
```

---

## Pages

### `/` — Landing Page (`landing.tsx`)

Marketing page. Static content showing:
- Hero section with "AI-powered" headline and "New Analysis" CTA
- Feature cards (8 features)
- "How it works" 3-step explainer
- Source type grid (10 supported input types with icons)

No API calls.

---

### `/dashboard` — Dashboard (`dashboard.tsx`)

Main dashboard. Fetches:
- `useGetAnalysisSummary()` — stats (total, completed, running, failed, avgConfidence, byInputType)
- Last 6 completed analyses via `useGetAnalyses({ status: "completed", limit: 6 })`

Displays:
- **Stat cards**: Total Analyses, Completed, Avg Confidence, Failed
- **Input type breakdown**: Recharts `PieChart` or `BarChart` of `byInputType` data
- **Recent analyses**: List of last 6 completed with severity badge, confidence bar, and relative timestamp

---

### `/new` — New Analysis (`new.tsx`)

Multi-step form for submitting a bug report. 

**Source type cards** (8 cards arranged in a 2×4 or 4×2 grid):

| Card | Icon | Description |
|------|------|-------------|
| Raw Text | `FileText` | Plain English bug description |
| GitHub Issue | `Github` | Auto-fetches GitHub issue content |
| Stack Trace | `Terminal` | Stack trace or error output |
| Jira Ticket | `Ticket` | Jira ticket description |
| Sentry Event | `AlertOctagon` | Sentry error event |
| Log File | `ScrollText` | Log file output |
| cURL Request | `Zap` | Failed API/curl request |
| Video Description | `Video` | Screen recording description |

**GitHub URL special handling**:
- When `inputType = "github_url"`, a "Fetch Issue" button appears
- Calls `POST /api/github/fetch-issue` to retrieve title + body + comments
- Populates the text area with the fetched content

**Form fields**:
1. Source type selector (the 8 cards)
2. Title input
3. Raw input textarea (main bug description)
4. Optional: Code context accordion section
5. Optional: Tags input (comma-separated)
6. Optional: Project selector dropdown

**Submit flow**: `POST /api/analyses` → redirect to `/analyses/:id` → auto-trigger pipeline run

---

### `/analyses/:id` — Analysis Detail (`detail.tsx`)

The most complex page. Shows the full pipeline results in 8 tabs.

**Header area**:
- Analysis title (editable inline)
- Severity badge (color-coded: red=critical, orange=high, yellow=medium, green=low)
- Status indicator (running spinner / completed checkmark / failed X)
- Resolution status badge
- "Run Pipeline" button (disabled while running)
- "Export" link → `/analyses/:id/export`
- Tags display

**Pipeline progress** (visible while `status = "running"`):
- Real-time SSE event log — each `agent_start`, `agent_done`, `agent_validated` event appears as a new row
- Progress bar based on number of validated agents / total agents
- Shows agent name and current action

**8 Tabs:**

| Tab | Content |
|-----|---------|
| **Overview** | Extracted entities (component, trigger, environment, errors), confidence breakdown pie chart, severity reason |
| **Hypotheses** | Cards for each hypothesis with retained/eliminated badge, likelihood, mechanism, evidence lists |
| **Repro Steps** | Prerequisites list, numbered steps with expected outcomes, expected vs actual result boxes |
| **Test Code** | Syntax-highlighted code block, copy button, syntax validation status badge, "Regenerate" button |
| **Flow Diagram** | Mermaid rendered diagram (using `mermaid.initialize()` + `mermaid.render()`), with legend |
| **Similar Bugs** | Correlation results — fetched on tab open, cached, with "Refresh" button. Similarity % badges |
| **Team** | Live collaborator count (SSE), annotation feed, add annotation form |
| **Audit Trail** | Vertical timeline of all agent decisions with timestamps, durations, and detail rows |

**Confidence breakdown visualization**:
The collapsible panel shows each rubric criterion with a colored bar (green=scored, red=missed) and the "missing" items listed below.

**Mermaid rendering**:
```typescript
// On tab switch to Flow Diagram:
await mermaid.initialize({ theme: "dark", ... });
const { svg } = await mermaid.render("mermaid-" + id, analysis.flowDiagram);
container.innerHTML = svg;
```

---

### `/analyses/:id/export` — Export Page (`export.tsx`)

A fully rendered report view (NOT raw JSON or raw markdown).

**Header buttons**:
- **Copy MD**: Copies the server-generated markdown from `GET /api/analyses/:id/export`
- **Download .md**: Downloads the markdown as a file
- **GitHub Issue**: Generates and copies a GitHub issue format (title, steps, test code, questions)
- **Jira Format**: Generates and copies Jira wiki markup format
- **Print**: `window.print()` — print-optimized CSS hides the button row

**Report sections** (all parsed from JSON columns):
1. **Report header**: Title, severity badge, confidence %, date, auto-tags
2. **Extracted Entities**: Labeled cards for component, trigger, expected, actual, environment, errors
3. **Root Cause Hypotheses**: Cards with retained/eliminated badges, likelihood, mechanism
4. **Reproduction Steps**: Prerequisites bullet list, numbered steps with expected outcomes, expected vs actual boxes
5. **Generated Test Code**: Syntax-highlighted pre block with copy button and syntax status
6. **AI Fix Suggestions**: Ranked cards with title, description, code location, effort badge (if available)
7. **Clarifying Questions**: Numbered list
8. **Original Bug Report**: Collapsible section with the raw input

All JSON fields are parsed with a `safeJson()` helper that returns a fallback value if parsing fails.

---

### `/history` — History (`history.tsx`)

Searchable and filterable table of all analyses.

**Search**: Text input filters by title (debounced, queries `GET /api/analyses?search=...`)

**Filters**:
- Status: All / Pending / Running / Completed / Failed
- Input type: All / Raw Text / GitHub Issue / Stack Trace / ...

**Table columns**: ID, Title, Type, Status, Severity, Confidence, Tags, Created, Actions (View / Delete)

**Delete**: Calls `DELETE /api/analyses/:id` with optimistic removal from the list.

---

### `/settings` — Settings (`settings.tsx`)

Configuration and reference page. Static content + display of configured agents.

**Sections**:
1. **Agent Pipeline**: Table listing all 7 agents with their role and model
2. **Source Types**: Grid of all 10 source types with description
3. **Confidence Rubric**: Table of rubric criteria, max points, and what earns them
4. **Tips**: Usage tips for best results

No writes — this page is informational only.

---

### `/tools/env-diff` — Env Diff (`env-diff.tsx`)

Side-by-side environment config comparison tool.

**Form**:
- Label A / Label B inputs (optional display names)
- Env config A textarea (key=value pairs or JSON)
- Env config B textarea
- Bug description textarea (required — context for relevance scoring)
- Submit button

**Results**:
- Overall verdict and likelihood badge
- Sorted diff table: `critical` first, then `likely`, `unlikely`, `irrelevant`
- Each row: key, value A, value B, classification badge, reasoning

---

### `/tools/nl2test` — NL2Test (`nl2test.tsx`)

Natural language to test case generator.

**Form**:
- Description textarea (what to test, in plain English)
- Framework selector (9 options)
- Optional code context accordion

**Results**:
- Framework badge
- Explanation text
- Syntax-highlighted test code block with copy button
- Coverage notes section

---

### `/tools/flaky-detector` — Flaky Detector (`flaky-detector.tsx`)

Paste test code and get a flakiness analysis.

**Form**:
- Test code textarea
- Language selector (TypeScript, JavaScript, Python, Ruby, Java)

**Results**:
- Overall risk badge (high/medium/low/none)
- Summary text
- Per-test cards with: test name, risk level badge, category label, explanation, fix suggestion

---

## Components

### `AppLayout` (`components/layout.tsx`)

Wraps every page. Renders:
- **Sticky header** with the BugRepro_Engine logo/brand link
- **Main nav** (Dashboard, New Analysis, History)
- **Tools dropdown** (Env Diff, NL2Test, Flaky Detector — expands on click, closes on outside click)
- **Notification bell** (pipeline completion/failure notifications)
- **Settings link**
- **`<main>` content area** (`max-w-6xl` centered with horizontal padding)

### `NotificationBell`

In-memory notification system (does not persist across page refreshes):
- Shows unread badge count
- Opens a dropdown list of recent pipeline events
- Each notification links to the analysis detail page
- "Clear all" and "Mark read" actions

Notifications are added by the `NotificationsProvider` context — the detail page SSE handler calls `addNotification()` when `pipeline_done` or `error` events arrive.

### shadcn/ui Components Used

| Component | Used in |
|-----------|---------|
| `Button` | Throughout |
| `Card`, `CardHeader`, `CardContent`, `CardTitle` | Detail page, dashboard |
| `Badge` | Severity labels, status indicators |
| `Skeleton` | Loading states |
| `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | Detail page |
| `Input`, `Textarea` | All forms |
| `Select`, `SelectContent`, `SelectItem` | Framework selector, filters |
| `Accordion`, `AccordionItem` | Confidence breakdown, code context |
| `Tooltip`, `TooltipContent` | Confidence rubric labels |
| `Toaster`, `useToast` | Success/error toasts |

---

## State Management

### Server State (TanStack Query)

All API data is managed by TanStack Query. Generated hooks from `@workspace/api-client-react`:

| Hook | Endpoint | Used in |
|------|----------|---------|
| `useGetAnalyses(params)` | `GET /api/analyses` | History, Dashboard |
| `useGetAnalysis(id)` | `GET /api/analyses/:id` | Detail, Export |
| `useCreateAnalysis()` | `POST /api/analyses` | New page |
| `useDeleteAnalysis()` | `DELETE /api/analyses/:id` | History |
| `useGetAnalysisSummary()` | `GET /api/analyses/stats/summary` | Dashboard |
| `useExportAnalysis(id)` | `GET /api/analyses/:id/export` | Export page |
| `useGetAnnotations(id)` | `GET /api/analyses/:id/annotations` | Detail (Team tab) |
| `useCreateAnnotation()` | `POST /api/analyses/:id/annotations` | Detail (Team tab) |

**Cache invalidation**: After pipeline completes (`pipeline_done` SSE event), the detail page calls `queryClient.invalidateQueries(getGetAnalysisQueryKey(id))` to trigger a fresh fetch.

### Client State

| State | Where | What |
|-------|-------|------|
| Active tab | Detail page | `useState<string>` — which of the 8 tabs is visible |
| Pipeline events | Detail page | `useState<AgentEvent[]>` — live SSE event log |
| Notifications | `NotificationsProvider` | `useState<Notification[]>` — in-memory notification list |
| Tools dropown | Layout | `useState<boolean>` — open/closed |
| Correlation cache | Detail page | Stored in TanStack Query cache after first fetch |

---

## Environment Variables (Frontend)

| Variable | Set by | Value |
|----------|--------|-------|
| `VITE_API_BASE_URL` | Vite config | `/api` (via Replit proxy) |
| `BASE_URL` | Vite | `/` (the artifact's base path) |
| `MODE` | Vite | `"development"` or `"production"` |

The generated hooks use `VITE_API_BASE_URL` as the base for all fetch calls.

---

## Code Generation

The frontend never writes raw `fetch('/api/...')` for CRUD operations. Instead:

1. `lib/api-spec/openapi.yaml` defines the contract
2. `pnpm --filter @workspace/api-spec run codegen` runs Orval
3. Orval generates `lib/api-client-react/src/` (hooks) and `lib/api-zod/src/` (schemas)
4. Frontend imports from `@workspace/api-client-react`

**To add a new endpoint to the frontend:**
1. Add the path to `openapi.yaml`
2. Run codegen
3. Import the generated hook in your component
