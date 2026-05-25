import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, GitCompare, AlertTriangle, CheckCircle, Info, XCircle, Clock, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useToolHistory } from "@/hooks/use-tool-history";
import { format } from "date-fns";

type EnvDifference = {
  key: string;
  value1: string | null;
  value2: string | null;
  impact: "critical" | "likely" | "unlikely" | "irrelevant";
  reasoning: string;
};

type EnvDiffResult = {
  differences: EnvDifference[];
  verdict: string;
  likelihood: "high" | "medium" | "low";
  summary: string;
};

const impactConfig = {
  critical: { label: "Critical", color: "text-red-400", bg: "border-red-500/30 bg-red-500/5", icon: XCircle },
  likely: { label: "Likely", color: "text-amber-400", bg: "border-amber-500/30 bg-amber-500/5", icon: AlertTriangle },
  unlikely: { label: "Unlikely", color: "text-blue-400", bg: "border-blue-500/30 bg-blue-500/5", icon: Info },
  irrelevant: { label: "Irrelevant", color: "text-muted-foreground", bg: "border-border bg-muted/20", icon: CheckCircle },
};

const likelihoodColor = { high: "text-red-400", medium: "text-amber-400", low: "text-green-400" };

export function EnvDiffPage() {
  const { toast } = useToast();
  const [label1, setLabel1] = useState("Local");
  const [label2, setLabel2] = useState("Staging");
  const [env1, setEnv1] = useState("");
  const [env2, setEnv2] = useState("");
  const [bugDescription, setBugDescription] = useState("");
  const [result, setResult] = useState<EnvDiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { history, addEntry, clearHistory } = useToolHistory<EnvDiffResult>("env-diff");

  const handleCompare = async () => {
    if (!env1.trim() || !env2.trim() || !bugDescription.trim()) {
      toast({ variant: "destructive", title: "All fields required", description: "Fill in both environment configs and the bug description." });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/tools/env-diff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ env1, env2, bugDescription, label1, label2 }),
      });

      if (!res.ok) throw new Error("Request failed");
      const data = await res.json() as EnvDiffResult;
      setResult(data);
      addEntry(`${label1} vs ${label2} — ${bugDescription.slice(0, 60)}${bugDescription.length > 60 ? "…" : ""}`, data);
    } catch {
      toast({ variant: "destructive", title: "Analysis failed", description: "Could not compare environments. Try again." });
    } finally {
      setLoading(false);
    }
  };

  const restoreFromHistory = (entry: { label: string; result: EnvDiffResult }) => {
    setResult(entry.result);
    setShowHistory(false);
    toast({ title: "Result restored", description: entry.label });
  };

  const sorted = result?.differences.slice().sort((a, b) => {
    const order = { critical: 0, likely: 1, unlikely: 2, irrelevant: 3 };
    return order[a.impact] - order[b.impact];
  }) ?? [];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <GitCompare className="w-6 h-6 text-primary" />
              Environment Diff Detector
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Compare two environment configs to pinpoint what's causing intermittent bugs.
            </p>
          </div>
        </div>
        {history.length > 0 && (
          <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={() => setShowHistory(v => !v)}>
            <Clock className="w-4 h-4" />
            History ({history.length})
          </Button>
        )}
      </div>

      {showHistory && history.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Past Comparisons</CardTitle>
            <Button variant="ghost" size="sm" className="text-destructive h-7 px-2 gap-1.5" onClick={() => { clearHistory(); setShowHistory(false); }}>
              <Trash2 className="w-3.5 h-3.5" /> Clear all
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {history.map(entry => (
              <div key={entry.id} className="rounded-lg border border-border/50 overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge variant="outline" className={`text-xs shrink-0 ${likelihoodColor[entry.result.likelihood]}`}>
                      {entry.result.likelihood.toUpperCase()}
                    </Badge>
                    <span className="text-sm truncate">{entry.label}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className="text-xs text-muted-foreground">{format(new Date(entry.createdAt), "MMM d, HH:mm")}</span>
                    {expandedId === entry.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </div>
                </button>
                {expandedId === entry.id && (
                  <div className="border-t border-border/50 bg-muted/20 px-4 py-3 space-y-2">
                    <p className="text-sm">{entry.result.verdict}</p>
                    <p className="text-xs text-muted-foreground">{entry.result.differences.length} differences · {entry.result.differences.filter(d => d.impact === "critical").length} critical</p>
                    <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => restoreFromHistory(entry)}>
                      Restore result
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">Bug / Behavior Description</Label>
              <Textarea
                value={bugDescription}
                onChange={e => setBugDescription(e.target.value)}
                placeholder="Describe the bug — e.g. 'Login works locally but 401s on staging after token refresh'"
                rows={3}
                className="font-mono text-sm resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">Label A</Label>
                <Input value={label1} onChange={e => setLabel1(e.target.value)} placeholder="Local" />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">Label B</Label>
                <Input value={label2} onChange={e => setLabel2(e.target.value)} placeholder="Staging" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">{label1 || "Environment A"}</Label>
                <Textarea
                  value={env1}
                  onChange={e => setEnv1(e.target.value)}
                  placeholder={"NODE_ENV=development\nJWT_SECRET=local-secret\nDB_POOL_SIZE=5\nNODE_VERSION=18.12.0"}
                  rows={10}
                  className="font-mono text-xs resize-none"
                />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">{label2 || "Environment B"}</Label>
                <Textarea
                  value={env2}
                  onChange={e => setEnv2(e.target.value)}
                  placeholder={"NODE_ENV=production\nJWT_SECRET=prod-secret\nDB_POOL_SIZE=20\nNODE_VERSION=20.11.0"}
                  rows={10}
                  className="font-mono text-xs resize-none"
                />
              </div>
            </div>
            <Button onClick={handleCompare} disabled={loading} className="w-full">
              {loading ? "Analyzing differences..." : "Compare Environments"}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {loading && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm">AI is analyzing environment differences...</p>
              </CardContent>
            </Card>
          )}

          {result && (
            <>
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="pt-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Verdict</span>
                    <Badge variant="outline" className={`text-xs font-mono ${likelihoodColor[result.likelihood]}`}>
                      {result.likelihood.toUpperCase()} CONFIDENCE
                    </Badge>
                  </div>
                  <p className="text-sm leading-relaxed">{result.verdict}</p>
                  <p className="text-xs text-muted-foreground border-t border-border pt-2 mt-2">{result.summary}</p>
                </CardContent>
              </Card>

              <div className="space-y-3">
                <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  {sorted.length} Differences Found
                </h3>
                {sorted.length === 0 && (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground text-sm">
                      No differences detected between the environments.
                    </CardContent>
                  </Card>
                )}
                {sorted.map((diff, i) => {
                  const cfg = impactConfig[diff.impact];
                  const Icon = cfg.icon;
                  return (
                    <div key={i} className={`rounded-lg border p-4 space-y-2 ${cfg.bg}`}>
                      <div className="flex items-center justify-between">
                        <code className="text-sm font-bold font-mono">{diff.key}</code>
                        <div className={`flex items-center gap-1.5 text-xs font-medium ${cfg.color}`}>
                          <Icon className="w-3.5 h-3.5" />
                          {cfg.label}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                        <div className="space-y-1">
                          <div className="text-muted-foreground">{label1}</div>
                          <div className="bg-background/60 rounded px-2 py-1 truncate">
                            {diff.value1 ?? <span className="italic text-muted-foreground">not set</span>}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-muted-foreground">{label2}</div>
                          <div className="bg-background/60 rounded px-2 py-1 truncate">
                            {diff.value2 ?? <span className="italic text-muted-foreground">not set</span>}
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">{diff.reasoning}</p>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {!result && !loading && (
            <Card className="border-dashed">
              <CardContent className="py-16 text-center text-muted-foreground">
                <GitCompare className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Results will appear here after comparison</p>
                {history.length > 0 && (
                  <p className="text-xs mt-2 opacity-60">{history.length} past comparison{history.length !== 1 ? "s" : ""} saved — click History above</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
