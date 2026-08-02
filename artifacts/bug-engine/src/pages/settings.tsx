import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Github, FileText, GitMerge, Terminal, CheckCircle, AlertTriangle,
  Server, RefreshCw, MonitorPlay, Key, Zap, Bug, Cpu, Code2, ExternalLink,
  Loader2, CheckCheck, XCircle, Eye, EyeOff
} from "lucide-react";

type Provider = "groq" | "openai" | "ollama" | "custom";

const PROVIDERS: { value: Provider; label: string; icon: React.ComponentType<{ className?: string }>; note: string; models: string[] }[] = [
  {
    value: "groq",
    label: "Groq",
    icon: Zap,
    note: "Fast open-source models. Get a free key at console.groq.com",
    models: ["llama-3.3-70b-versatile", "llama-3.1-70b-versatile", "mixtral-8x7b-32768", "gemma2-9b-it"],
  },
  {
    value: "openai",
    label: "OpenAI",
    icon: Bug,
    note: "GPT models via OpenAI API. Get a key at platform.openai.com",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
  },
  {
    value: "ollama",
    label: "Ollama (Local)",
    icon: Server,
    note: "Run models locally. Ollama must be running at the base URL. No API key needed.",
    models: ["llama3.2", "llama3.1", "mistral", "gemma2", "qwen2.5", "phi3"],
  },
  {
    value: "custom",
    label: "Custom Endpoint",
    icon: Code2,
    note: "Any OpenAI-compatible API: LM Studio, vLLM, OpenRouter, or self-hosted.",
    models: [],
  },
];

const PROVIDER_BASE_URLS: Record<Provider, string> = {
  groq: "https://api.groq.com/openai/v1",
  openai: "https://api.openai.com/v1",
  ollama: "http://localhost:11434/v1",
  custom: "",
};

interface LLMStatus {
  provider: Provider;
  apiKeySet: boolean;
  apiKeyPreview: string;
  baseURL: string;
  model: string;
  useEnvConfig: boolean;
  envSource: string | null;
}

interface TestResult {
  ok: boolean;
  model: string;
  latencyMs: number;
  error?: string;
}

export function Settings() {
  const [llmStatus, setLlmStatus] = useState<LLMStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state
  const [provider, setProvider] = useState<Provider>("groq");
  const [apiKey, setApiKey] = useState("");
  const [baseURL, setBaseURL] = useState("");
  const [model, setModel] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  useEffect(() => {
    fetch("/api/settings/llm")
      .then(r => r.json())
      .then((data: LLMStatus) => {
        setLlmStatus(data);
        setProvider(data.provider);
        setBaseURL(data.baseURL || PROVIDER_BASE_URLS[data.provider] || "");
        setModel(data.model || "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const selectedProvider = PROVIDERS.find(p => p.value === provider)!;

  function handleProviderChange(p: Provider) {
    setProvider(p);
    setBaseURL(PROVIDER_BASE_URLS[p] || "");
    const preset = PROVIDERS.find(x => x.value === p);
    if (preset && preset.models.length > 0) setModel(preset.models[0]);
    setTestResult(null);
  }

  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);
    try {
      const body: Record<string, string> = { provider, model, baseURL };
      if (provider !== "ollama") body.apiKey = apiKey;
      const resp = await fetch("/api/settings/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (resp.ok) {
        setLlmStatus(data.config);
        setSaveMsg({ ok: true, text: "Configuration saved successfully." });
        setApiKey(""); // clear sensitive field
      } else {
        setSaveMsg({ ok: false, text: data.error || "Failed to save." });
      }
    } catch {
      setSaveMsg({ ok: false, text: "Network error. Try again." });
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!confirm("Reset to environment-variable-based config?")) return;
    await fetch("/api/settings/llm/reset", { method: "POST" });
    const data = await fetch("/api/settings/llm").then(r => r.json());
    setLlmStatus(data);
    setSaveMsg({ ok: true, text: "Reset to default configuration." });
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const resp = await fetch("/api/settings/llm/test", { method: "POST" });
      const data = await resp.json() as TestResult;
      setTestResult(data);
    } catch {
      setTestResult({ ok: false, model: "", latencyMs: 0, error: "Network error" });
    } finally {
      setTesting(false);
    }
  }

  const agents = [
    { name: "Entity Extraction", purpose: "Identifies components, trigger actions, expected vs actual, environment, error messages" },
    { name: "Hypothesis Generator", purpose: "Creates 3-5 ranked root cause theories with retained/eliminated status" },
    { name: "Step Validator", purpose: "Produces precise, numbered reproduction steps with prerequisites" },
    { name: "Test Writer", purpose: "Generates executable test code with server-side syntax validation" },
    { name: "Analysis Synthesizer", purpose: "Mermaid flow diagram, clarifying questions, severity classification" },
    { name: "Fix Suggester", purpose: "3-5 ranked concrete code fix suggestions with location and effort" },
    { name: "Auto-Tagger", purpose: "3-8 lowercase hyphenated taxonomy tags for search and classification" },
  ];

  const sourceTypes = [
    { icon: FileText, label: "Raw Text", desc: "Paste a bug description in plain English" },
    { icon: GitMerge, label: "GitHub Issue", desc: "Paste a GitHub issue URL to auto-fetch content" },
    { icon: Terminal, label: "Stack Trace", desc: "Paste a stack trace or error output" },
    { icon: CheckCircle, label: "Jira Ticket", desc: "Paste a Jira ticket description or URL" },
    { icon: AlertTriangle, label: "Sentry Event", desc: "Paste a Sentry event URL, ID, or error details" },
    { icon: Server, label: "Log File", desc: "Paste log file output around the time of the bug" },
    { icon: RefreshCw, label: "curl / API Request", desc: "Paste a failed curl command or API request/response" },
    { icon: MonitorPlay, label: "Video / Recording", desc: "Describe what you see in a screen recording" },
    { icon: MonitorPlay, label: "Screenshot", desc: "Describe what's visible in a bug screenshot" },
    { icon: MonitorPlay, label: "Perf Profile", desc: "Paste a profiler output or performance trace" },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-12 animate-in fade-in duration-500 pb-16">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings & About</h1>
        <p className="text-muted-foreground mt-1">Configure AI provider, view pipeline agents, and learn about BugRepro Engine.</p>
      </div>

      {/* ─── AI Provider Section ─────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 border-b border-border/50 pb-2">
          <Key className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-semibold">AI Provider (BYOK)</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Choose your AI provider and bring your own API key. Supports Groq, OpenAI, local Ollama models, and any OpenAI-compatible endpoint.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading current configuration…
          </div>
        ) : (
          <>
            {/* Current status banner */}
            {llmStatus && (
              <Card className="bg-muted/30 border-border/50">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="text-muted-foreground">Active:</span>
                    <Badge variant="secondary" className="font-mono text-xs">{llmStatus.provider}</Badge>
                    <span className="font-mono text-xs text-primary">{llmStatus.model}</span>
                    {llmStatus.apiKeySet && (
                      <span className="text-muted-foreground font-mono text-xs">key: {llmStatus.apiKeyPreview}</span>
                    )}
                    {llmStatus.useEnvConfig && llmStatus.envSource && (
                      <Badge variant="outline" className="text-[10px]">from env: {llmStatus.envSource}</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Provider selector */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {PROVIDERS.map(p => {
                const Icon = p.icon;
                const active = provider === p.value;
                return (
                  <button
                    key={p.value}
                    onClick={() => handleProviderChange(p.value)}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/50 bg-card/50 text-muted-foreground hover:border-border hover:text-foreground"
                    }`}
                  >
                    <Icon className="w-4 h-4 mb-1" />
                    <div className="text-xs font-semibold">{p.label}</div>
                  </button>
                );
              })}
            </div>

            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-5 space-y-4">
                <p className="text-sm text-muted-foreground">{selectedProvider.note}</p>

                {/* API Key */}
                {provider !== "ollama" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="apiKey" className="text-sm">API Key</Label>
                    <div className="relative">
                      <Input
                        id="apiKey"
                        type={showKey ? "text" : "password"}
                        placeholder={llmStatus?.apiKeySet ? `Current: ${llmStatus.apiKeyPreview} (enter new to change)` : "Enter your API key…"}
                        value={apiKey}
                        onChange={e => setApiKey(e.target.value)}
                        className="pr-10 font-mono text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(v => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {provider === "groq" && <>Get a free key at <a href="https://console.groq.com" target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">console.groq.com <ExternalLink className="w-3 h-3" /></a></>}
                      {provider === "openai" && <>Get a key at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">platform.openai.com <ExternalLink className="w-3 h-3" /></a></>}
                      {provider === "custom" && "Your OpenAI-compatible endpoint API key"}
                    </p>
                  </div>
                )}

                {/* Base URL */}
                {(provider === "ollama" || provider === "custom") && (
                  <div className="space-y-1.5">
                    <Label htmlFor="baseURL" className="text-sm">Base URL</Label>
                    <Input
                      id="baseURL"
                      type="url"
                      value={baseURL}
                      onChange={e => setBaseURL(e.target.value)}
                      placeholder={PROVIDER_BASE_URLS[provider] || "https://your-endpoint/v1"}
                      className="font-mono text-sm"
                    />
                    {provider === "ollama" && (
                      <p className="text-xs text-muted-foreground">Default: http://localhost:11434/v1 — Ollama must be running locally.</p>
                    )}
                  </div>
                )}

                {/* Model */}
                <div className="space-y-1.5">
                  <Label htmlFor="model" className="text-sm">Model</Label>
                  {selectedProvider.models.length > 0 ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {selectedProvider.models.map(m => (
                          <button
                            key={m}
                            onClick={() => setModel(m)}
                            className={`px-2 py-1 rounded text-xs font-mono border transition-colors ${
                              model === m ? "border-primary bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:border-border"
                            }`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                      <Input
                        id="model"
                        value={model}
                        onChange={e => setModel(e.target.value)}
                        placeholder="Or enter a custom model name…"
                        className="font-mono text-sm"
                      />
                    </div>
                  ) : (
                    <Input
                      id="model"
                      value={model}
                      onChange={e => setModel(e.target.value)}
                      placeholder="Model name (e.g. llama3, mistral, gpt-4o)…"
                      className="font-mono text-sm"
                    />
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    onClick={handleSave}
                    disabled={saving || (!apiKey.trim() && provider !== "ollama" && !llmStatus?.apiKeySet) || !model.trim()}
                    className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors flex items-center gap-2"
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    Save Configuration
                  </button>
                  <button
                    onClick={handleTest}
                    disabled={testing}
                    className="px-4 py-2 rounded-md border border-border/50 bg-card/50 text-sm font-medium hover:bg-muted/50 transition-colors flex items-center gap-2"
                  >
                    {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    Test Connection
                  </button>
                  {llmStatus && !llmStatus.useEnvConfig && (
                    <button
                      onClick={handleReset}
                      className="px-4 py-2 rounded-md border border-border/50 bg-card/50 text-sm text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors"
                    >
                      Reset to Defaults
                    </button>
                  )}
                </div>

                {/* Save message */}
                {saveMsg && (
                  <div className={`flex items-center gap-2 text-sm p-3 rounded-lg ${saveMsg.ok ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-destructive/10 text-destructive border border-destructive/20"}`}>
                    {saveMsg.ok ? <CheckCheck className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                    {saveMsg.text}
                  </div>
                )}

                {/* Test result */}
                {testResult && (
                  <div className={`p-3 rounded-lg border text-sm ${testResult.ok ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" : "bg-destructive/10 border-destructive/20 text-destructive"}`}>
                    {testResult.ok ? (
                      <div className="flex items-center gap-2">
                        <CheckCheck className="w-4 h-4 shrink-0" />
                        <span>Connected — <span className="font-mono">{testResult.model}</span> responded in {testResult.latencyMs}ms</span>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2">
                        <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>Connection failed: {testResult.error}</span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </section>

      {/* ─── About ─────────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold border-b border-border/50 pb-2">About</h2>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-6">
            <div className="space-y-4">
              <div>
                <div className="font-bold text-lg">BugRepro Engine</div>
                <div className="text-sm text-muted-foreground">Version 1.0.0</div>
              </div>
              <p className="text-sm">
                An advanced multi-agent AI tool that transforms varied bug reports into actionable hypotheses, reproduction steps, and executable test code.
              </p>
              <div className="flex gap-4 pt-2">
                <a href="https://github.com" target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1">
                  <Github className="w-4 h-4" /> GitHub Repository
                </a>
                <a href="/docs" className="text-sm text-primary hover:underline flex items-center gap-1">
                  <FileText className="w-4 h-4" /> Documentation
                </a>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ─── Pipeline Agents ────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold border-b border-border/50 pb-2">Pipeline Agents</h2>
        <p className="text-sm text-muted-foreground">The system uses a sequential multi-agent architecture. Each agent handles a specific part of the bug reproduction process.</p>
        <div className="border border-border/50 rounded-md overflow-hidden bg-card/50">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Agent Name</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Model</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((agent) => (
                <TableRow key={agent.name}>
                  <TableCell className="font-medium font-mono text-sm">{agent.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{agent.purpose}</TableCell>
                  <TableCell className="font-mono text-xs text-primary">
                    {llmStatus ? llmStatus.model : "llama-3.3-70b-versatile"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* ─── Source Types ───────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold border-b border-border/50 pb-2">Source Types</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sourceTypes.map((source, i) => (
            <Card key={i} className="bg-card/50 border-border/50">
              <CardContent className="p-4 flex gap-4 items-start">
                <source.icon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium text-sm mb-1">{source.label}</div>
                  <div className="text-xs text-muted-foreground">{source.desc}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ─── Tips ──────────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold border-b border-border/50 pb-2">Tips for Best Results</h2>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-6">
            <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
              <li><strong className="text-foreground">Include the full stack trace:</strong> Don't truncate logs; the agents use the full call chain to pinpoint the exact failure location.</li>
              <li><strong className="text-foreground">Add code context:</strong> Provide relevant configuration, environment variables, or snippets for more accurate test generation.</li>
              <li><strong className="text-foreground">Use GitHub URL mode:</strong> When dealing with GitHub issues, paste the URL instead of text to automatically fetch metadata, labels, and comments.</li>
              <li><strong className="text-foreground">Be specific with video descriptions:</strong> For visual bugs, describe what you see happening second-by-second.</li>
              <li><strong className="text-foreground">Use local models for privacy:</strong> Set provider to Ollama to run everything locally — no data leaves your machine.</li>
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
