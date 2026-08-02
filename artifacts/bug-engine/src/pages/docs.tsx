import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  Bug, Zap, Terminal, GitBranch, FileCode, Server, AlertTriangle, RefreshCw,
  MonitorPlay, Settings, ArrowRight, ChevronDown, ChevronRight, Cpu,
  Shield, Code2, FlaskConical, Shuffle, GitCompare, BookOpen, Key
} from "lucide-react";

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-4 scroll-mt-20">
      <h2 className="text-2xl font-bold tracking-tight border-b border-border/50 pb-3">{title}</h2>
      {children}
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}

function CodeBlock({ code, language = "bash" }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative group">
      <pre className="bg-muted/60 border border-border/50 rounded-lg p-4 text-sm font-mono overflow-x-auto">
        <code className={`language-${language}`}>{code}</code>
      </pre>
      <button
        onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="absolute top-2 right-2 px-2 py-1 text-[11px] font-mono rounded bg-muted border border-border/50 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

function Callout({ type = "info", children }: { type?: "info" | "warn" | "tip"; children: React.ReactNode }) {
  const styles = {
    info: "bg-blue-500/10 border-blue-500/30 text-blue-300",
    warn: "bg-amber-500/10 border-amber-500/30 text-amber-300",
    tip: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
  };
  const labels = { info: "Info", warn: "Warning", tip: "Tip" };
  return (
    <div className={`border rounded-lg p-4 text-sm ${styles[type]}`}>
      <span className="font-bold mr-2">{labels[type]}:</span>
      {children}
    </div>
  );
}

const toc = [
  { id: "overview", label: "Overview" },
  { id: "quickstart", label: "Quick Start" },
  { id: "byok", label: "BYOK & Local LLMs" },
  { id: "pipeline", label: "AI Pipeline" },
  { id: "source-types", label: "Source Types" },
  { id: "tools", label: "Developer Tools" },
  { id: "api", label: "API Reference" },
  { id: "features", label: "Features" },
];

export function DocsPage() {
  const [activeSection, setActiveSection] = useState("overview");

  return (
    <div className="max-w-6xl mx-auto pb-24">
      <div className="mb-8 animate-in fade-in duration-500">
        <h1 className="text-4xl font-bold tracking-tight mb-2 flex items-center gap-3">
          <BookOpen className="w-8 h-8 text-primary" />
          Documentation
        </h1>
        <p className="text-muted-foreground text-lg">
          Complete guide to BugRepro Engine — AI-powered bug reproduction and debugging.
        </p>
      </div>

      <div className="flex gap-8">
        {/* Sidebar TOC */}
        <aside className="hidden lg:block w-52 shrink-0">
          <div className="sticky top-20 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-2">On this page</p>
            {toc.map(item => (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={() => setActiveSection(item.id)}
                className={`block px-2 py-1.5 rounded text-sm transition-colors ${
                  activeSection === item.id
                    ? "text-primary bg-primary/10 font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {item.label}
              </a>
            ))}
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-16 animate-in fade-in duration-500 delay-100">

          {/* Overview */}
          <Section id="overview" title="Overview">
            <p className="text-muted-foreground leading-relaxed">
              BugRepro Engine is an <strong className="text-foreground">AI-powered multi-agent system</strong> that transforms vague, hard-to-reproduce bug reports into structured, verifiable debugging workflows. It ingests 10 different input types — from plain text to GitHub issues, stack traces, Sentry events, and more — and runs them through a 5-agent sequential pipeline.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
              {[
                { icon: Cpu, title: "5-Agent Pipeline", desc: "Sequential AI agents from entity extraction to test generation" },
                { icon: Code2, title: "10 Input Types", desc: "Plain text, GitHub, stack traces, Sentry, logs, curl, video, screenshots and more" },
                { icon: FlaskConical, title: "6 Developer Tools", desc: "Env Diff, NL2Test, Flaky Detector, Regression Guard, Bug Digest, and more" },
              ].map(({ icon: Icon, title, desc }) => (
                <Card key={title} className="bg-card/50 border-border/50">
                  <CardContent className="p-4">
                    <Icon className="w-6 h-6 text-primary mb-2" />
                    <div className="font-semibold text-sm mb-1">{title}</div>
                    <div className="text-xs text-muted-foreground">{desc}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </Section>

          {/* Quick Start */}
          <Section id="quickstart" title="Quick Start">
            <SubSection title="1. Submit a bug report">
              <p className="text-muted-foreground text-sm">Go to <Link href="/new" className="text-primary hover:underline">New Analysis</Link> and choose your input type. Paste the raw content — the AI handles the rest.</p>
            </SubSection>
            <SubSection title="2. Run the pipeline">
              <p className="text-muted-foreground text-sm">After creating an analysis, click <strong className="text-foreground">Run Pipeline</strong> on the detail page. You'll see real-time SSE updates as each agent completes.</p>
            </SubSection>
            <SubSection title="3. Review results">
              <p className="text-muted-foreground text-sm">Results are organized into 8 tabs: Reproduction Steps, Test Code, Flow Diagram, Hypotheses, Confidence Score, Similar Bugs, Team, and Audit Trail.</p>
            </SubSection>
            <Callout type="tip">
              For best results, paste the <strong>full</strong> stack trace or log output — the agents use the complete call chain to pinpoint failures.
            </Callout>
          </Section>

          {/* BYOK */}
          <Section id="byok" title="BYOK & Local LLMs">
            <p className="text-muted-foreground text-sm leading-relaxed">
              By default, the engine uses the built-in Groq integration. You can override this on the{" "}
              <Link href="/settings" className="text-primary hover:underline">Settings page</Link>{" "}
              to use your own API key or a locally-running LLM.
            </p>

            <SubSection title="Supported providers">
              <div className="space-y-3">
                {[
                  { icon: Zap, name: "Groq", badge: "Default", desc: "Fast open-source models via Groq Cloud. Uses llama-3.3-70b-versatile by default. Set GROQ_API_KEY env var or enter key in Settings.", models: "llama-3.3-70b-versatile, mixtral-8x7b-32768, gemma2-9b-it" },
                  { icon: Bug, name: "OpenAI", badge: "BYOK", desc: "GPT models via OpenAI API. Enter your OpenAI API key in Settings.", models: "gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo" },
                  { icon: Server, name: "Ollama (Local)", badge: "Local", desc: "Run any GGUF model locally. Start Ollama on your machine, it will be available at localhost:11434. No API key needed.", models: "llama3.2, mistral, gemma2, qwen2.5, phi3" },
                  { icon: Code2, name: "Custom endpoint", badge: "Advanced", desc: "Any OpenAI-compatible endpoint. Useful for LM Studio, vLLM, OpenRouter, or self-hosted inference.", models: "Depends on your server" },
                ].map(({ icon: Icon, name, badge, desc, models }) => (
                  <Card key={name} className="bg-card/50 border-border/50">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className="w-4 h-4 text-primary" />
                        <span className="font-semibold text-sm">{name}</span>
                        <Badge variant="secondary" className="text-[10px]">{badge}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">{desc}</p>
                      <div className="text-xs font-mono text-muted-foreground/70">Models: {models}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </SubSection>

            <SubSection title="Using Ollama (local models)">
              <p className="text-muted-foreground text-sm mb-2">Ollama lets you run LLMs fully locally with no API key or cost. Setup:</p>
              <CodeBlock language="bash" code={`# 1. Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 2. Pull a model (pick one)
ollama pull llama3.2
ollama pull mistral
ollama pull qwen2.5

# 3. Ollama auto-starts at http://localhost:11434
# 4. Go to Settings → AI Provider → Select "Ollama (local models)"
#    Set model name to match what you pulled (e.g. llama3.2)`} />
              <Callout type="warn">
                Local models may be significantly slower and less accurate than cloud-hosted alternatives, especially for structured JSON output. Llama 3.2 and Mistral work best.
              </Callout>
            </SubSection>

            <SubSection title="Priority order">
              <p className="text-muted-foreground text-sm">When multiple configs exist, the system picks in this order:</p>
              <ol className="list-decimal pl-5 space-y-1 text-sm text-muted-foreground mt-2">
                <li>Saved config from Settings page (stored in <code className="font-mono text-xs bg-muted px-1 rounded">.llm-config.json</code>)</li>
                <li><code className="font-mono text-xs bg-muted px-1 rounded">GROQ_API_KEY</code> environment variable</li>
                <li><code className="font-mono text-xs bg-muted px-1 rounded">OPENAI_API_KEY</code> environment variable</li>
                <li><code className="font-mono text-xs bg-muted px-1 rounded">AI_INTEGRATIONS_OPENAI_API_KEY</code> (Replit integration)</li>
              </ol>
            </SubSection>
          </Section>

          {/* Pipeline */}
          <Section id="pipeline" title="AI Pipeline">
            <p className="text-muted-foreground text-sm leading-relaxed">
              Every analysis runs through a 5-agent sequential pipeline. Agents are validated against strict Zod schemas — if an agent's output fails validation, it retries once with a correction prompt before failing.
            </p>
            <div className="space-y-3 mt-2">
              {[
                { n: 1, name: "Entity Extraction", icon: Terminal, desc: "Parses the raw bug input and identifies structured components: affected component, trigger action, expected behavior, actual behavior, environment details, and error messages." },
                { n: 2, name: "Hypothesis Generator", icon: GitBranch, desc: "Generates 3-5 ranked root cause theories. Each hypothesis is marked RETAINED or ELIMINATED with a detailed rationale and evidence from the input." },
                { n: 3, name: "Step Validator", icon: ArrowRight, desc: "Produces precise, numbered reproduction steps with prerequisites, environment requirements, and an overall confidence rating (0-100)." },
                { n: 4, name: "Test Writer", icon: FileCode, desc: "Generates complete, executable test code. Supports Jest/TS, Jest/JS, Vitest, Mocha+Chai, Pytest, Cypress, Playwright, RSpec, and JUnit. Tests include happy path, edge case, and regression coverage. Syntax is validated server-side." },
                { n: 5, name: "Analysis Synthesizer", icon: Cpu, desc: "Generates a Mermaid flow diagram, 5 clarifying questions for the reporter, a 0-100 confidence score with rubric breakdown, and a severity classification (critical/high/medium/low) with rationale." },
              ].map(({ n, name, icon: Icon, desc }) => (
                <div key={n} className="flex gap-4 p-4 rounded-lg bg-card/50 border border-border/50">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/20 text-primary font-bold text-sm shrink-0">{n}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-4 h-4 text-primary" />
                      <span className="font-semibold text-sm">{name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <SubSection title="Non-critical agents (run after pipeline)">
              <p className="text-muted-foreground text-sm">Two additional agents run after the main pipeline and never block it:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                <Card className="bg-card/50 border-border/50">
                  <CardContent className="p-4">
                    <div className="font-semibold text-sm mb-1">Fix Suggester</div>
                    <p className="text-xs text-muted-foreground">Generates 3-5 ranked concrete code fix suggestions with file location, effort estimate, and implementation notes.</p>
                  </CardContent>
                </Card>
                <Card className="bg-card/50 border-border/50">
                  <CardContent className="p-4">
                    <div className="font-semibold text-sm mb-1">Auto-Tagger</div>
                    <p className="text-xs text-muted-foreground">Generates 3-8 lowercase hyphenated taxonomy tags for classification and search (e.g. <code className="font-mono text-xs">memory-leak, react, async-bug</code>).</p>
                  </CardContent>
                </Card>
              </div>
            </SubSection>
          </Section>

          {/* Source Types */}
          <Section id="source-types" title="Source Types">
            <p className="text-muted-foreground text-sm">BugRepro Engine accepts 10 input formats. Each activates source-specific agent prompts for more accurate extraction.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              {[
                { icon: FileCode, label: "Raw Text", hint: "Plain English description of the bug" },
                { icon: GitBranch, label: "GitHub Issue URL", hint: "Paste the URL — content is auto-fetched including labels, body, and comments" },
                { icon: Terminal, label: "Stack Trace", hint: "Full error output including call chain and chained causes" },
                { icon: AlertTriangle, label: "Jira Ticket", hint: "Ticket description, priority fields, acceptance criteria" },
                { icon: AlertTriangle, label: "Sentry Event", hint: "Sentry URL, event ID, or pasted event JSON with breadcrumbs" },
                { icon: Server, label: "Log File", hint: "Raw log output around the time of failure — include as much as possible" },
                { icon: RefreshCw, label: "curl / API Request", hint: "Failed curl command with response headers and body" },
                { icon: MonitorPlay, label: "Video Description", hint: "Second-by-second description of what happens in a screen recording" },
                { icon: Bug, label: "Screenshot", hint: "Description of what's visible in a bug screenshot — error messages, UI state" },
                { icon: Zap, label: "Performance Profile", hint: "Profiler output, flamegraph description, or performance trace" },
              ].map(({ icon: Icon, label, hint }) => (
                <div key={label} className="flex gap-3 p-3 rounded-lg bg-card/50 border border-border/50">
                  <Icon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">{label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Tools */}
          <Section id="tools" title="Developer Tools">
            <p className="text-muted-foreground text-sm mb-4">Standalone AI tools available under the Tools menu — no analysis required.</p>
            <div className="space-y-4">
              {[
                { icon: GitCompare, name: "Env Diff Detector", href: "/tools/env-diff", desc: "Compare two environment configs (key=value or JSON). AI classifies each difference as critical, likely, unlikely, or irrelevant relative to a described bug. Returns a verdict, likelihood score, and per-diff reasoning." },
                { icon: FlaskConical, name: "NL2Test", href: "/tools/nl2test", desc: "Generate a complete, runnable test from a plain English description. Supports 9 frameworks: Jest/TS, Jest/JS, Vitest, Mocha+Chai, Pytest, Cypress, Playwright, RSpec, and JUnit. Output includes explanation and coverage notes." },
                { icon: Shuffle, name: "Flaky Test Detector", href: "/tools/flaky-detector", desc: "Paste a test suite and get an AI risk analysis. Detects race conditions, non-deterministic data, timing issues, external dependencies, and state leaks. Returns per-test risk level with concrete fix suggestions." },
                { icon: Shield, name: "Regression Guard", href: "/tools/regression-guard", desc: "Describe a code change and get an AI assessment of regression risk across 6 dimensions: breaking changes, behavior changes, performance, security, data integrity, and API compatibility." },
                { icon: BookOpen, name: "Bug Digest", href: "/tools/bug-digest", desc: "Get a curated digest of all recent analyses: top recurring patterns, most common root causes, frequently affected components, and team-wide trends." },
              ].map(({ icon: Icon, name, href, desc }) => (
                <Card key={name} className="bg-card/50 border-border/50">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="w-4 h-4 text-primary" />
                      <span className="font-semibold">{name}</span>
                      <Link href={href} className="ml-auto text-xs text-primary hover:underline flex items-center gap-0.5">
                        Open <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>
                    <p className="text-sm text-muted-foreground">{desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </Section>

          {/* API Reference */}
          <Section id="api" title="API Reference">
            <p className="text-muted-foreground text-sm mb-4">The API is available at <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">/api</code>. All endpoints return JSON unless noted.</p>
            <div className="space-y-6">
              {[
                {
                  group: "Analyses",
                  endpoints: [
                    { method: "GET", path: "/api/analyses", desc: "List all analyses. Supports ?status, ?inputType, ?search query params." },
                    { method: "POST", path: "/api/analyses", desc: "Create a new analysis. Body: { title, inputType, rawInput, githubUrl?, codeContext?, tags? }" },
                    { method: "GET", path: "/api/analyses/:id", desc: "Get a full analysis including all agent outputs." },
                    { method: "PATCH", path: "/api/analyses/:id", desc: "Update title, codeContext, or tags." },
                    { method: "DELETE", path: "/api/analyses/:id", desc: "Delete an analysis." },
                    { method: "POST", path: "/api/analyses/:id/run", desc: "Run the pipeline. Returns SSE stream of AgentEvent objects. Body: { frameworkHint? }" },
                    { method: "POST", path: "/api/analyses/:id/regenerate-test", desc: "Re-run only the Test Writer with a new framework. Body: { framework }" },
                    { method: "GET", path: "/api/analyses/:id/export", desc: "Export analysis as a markdown report." },
                    { method: "GET", path: "/api/analyses/:id/correlations", desc: "AI similarity search against all other completed analyses." },
                    { method: "GET", path: "/api/analyses/:id/annotations", desc: "List collaboration annotations." },
                    { method: "POST", path: "/api/analyses/:id/annotations", desc: "Add annotation. Body: { authorName, type, content, stepRef? }" },
                    { method: "GET", path: "/api/analyses/:id/collaborate", desc: "SSE stream for real-time annotation broadcast." },
                    { method: "GET", path: "/api/analyses/stats/summary", desc: "Dashboard stats: totals, avg confidence, by input type." },
                    { method: "GET", path: "/api/analyses/trends", desc: "Daily trend data. Supports ?days query param (default 30)." },
                  ],
                },
                {
                  group: "Tools",
                  endpoints: [
                    { method: "POST", path: "/api/tools/env-diff", desc: "Analyze environment config differences. Body: { env1, env2, bugDescription, label1?, label2? }" },
                    { method: "POST", path: "/api/tools/nl2test", desc: "Generate test from description. Body: { description, framework?, codeContext? }" },
                    { method: "POST", path: "/api/tools/flaky-detector", desc: "Detect flaky tests. Body: { testCode, language? }" },
                    { method: "POST", path: "/api/tools/regression-guard", desc: "Assess regression risk. Body: { changeSummary, codeContext? }" },
                    { method: "POST", path: "/api/tools/bug-digest", desc: "Generate bug digest. Body: { days? }" },
                  ],
                },
                {
                  group: "Settings",
                  endpoints: [
                    { method: "GET", path: "/api/settings/llm", desc: "Get current LLM provider config (API key masked)." },
                    { method: "POST", path: "/api/settings/llm", desc: "Save new LLM config. Body: { provider, apiKey, baseURL?, model }" },
                    { method: "POST", path: "/api/settings/llm/reset", desc: "Reset to environment-variable-based config." },
                    { method: "POST", path: "/api/settings/llm/test", desc: "Test the current LLM connection. Returns { ok, model, latencyMs, error? }" },
                  ],
                },
                {
                  group: "Other",
                  endpoints: [
                    { method: "POST", path: "/api/github/fetch-issue", desc: "Fetch a GitHub issue by URL. Body: { url }" },
                    { method: "GET", path: "/api/healthz", desc: "Health check." },
                  ],
                },
              ].map(({ group, endpoints }) => (
                <div key={group}>
                  <h3 className="text-base font-semibold mb-2 text-muted-foreground uppercase tracking-wider text-xs">{group}</h3>
                  <div className="space-y-1.5">
                    {endpoints.map(({ method, path: p, desc }) => (
                      <div key={`${method}:${p}`} className="flex flex-wrap gap-2 items-start p-2.5 rounded bg-muted/30 border border-border/30 text-sm">
                        <Badge variant={method === "GET" ? "secondary" : method === "POST" ? "default" : "outline"} className="text-[10px] font-mono shrink-0">
                          {method}
                        </Badge>
                        <code className="font-mono text-xs text-primary/90 shrink-0">{p}</code>
                        <span className="text-muted-foreground text-xs">{desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Features */}
          <Section id="features" title="Features">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { title: "Confidence Scoring", desc: "Every analysis produces a structured confidence breakdown: evidence supporting the score, assumptions made, and missing information. Shown as a collapsible panel with green/amber/red indicators." },
                { title: "Multi-Bug Correlation", desc: "AI compares a bug against all completed analyses and surfaces similar bugs with a similarity %, common factors, and historical root cause note. Results are cached after first fetch." },
                { title: "Collaboration Annotations", desc: "Multiple team members can annotate a running or completed analysis in real-time via SSE. Annotation types: note, verified, failed, question." },
                { title: "Audit Trail", desc: "Every pipeline stage logs timestamp, agent, action, decision, rationale, and duration. Shown as a vertical timeline in the Audit Trail tab." },
                { title: "Test Framework Selection", desc: "Pick any of 9 frameworks when running the pipeline. After completion, regenerate tests for a different framework without re-running all agents." },
                { title: "Severity Classification", desc: "Analysis Synthesizer classifies every bug as critical/high/medium/low with a one-sentence rationale. Shown as a colored badge across all views." },
                { title: "Export as Markdown", desc: "Every analysis exports as a clean markdown report with all agent outputs, suitable for pasting into GitHub issues, Confluence, or Notion." },
                { title: "Real-time SSE Pipeline", desc: "Watch agent output stream in real-time via Server-Sent Events. See each agent start, stream tokens, validate, and complete before the next begins." },
              ].map(({ title, desc }) => (
                <Card key={title} className="bg-card/50 border-border/50">
                  <CardContent className="p-4">
                    <div className="font-semibold text-sm mb-1">{title}</div>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </Section>

        </div>
      </div>
    </div>
  );
}
