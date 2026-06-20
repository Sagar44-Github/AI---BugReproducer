import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ShieldCheck, ShieldAlert, ShieldQuestion, AlertTriangle, CheckCircle2, Info, ArrowRight } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type GuardResult = {
  verdict: "would_catch" | "would_miss" | "uncertain";
  confidence: "high" | "medium" | "low";
  reasoning: string;
  criticalLines: string[];
  missedScenarios: string[];
  recommendation: string;
};

const VERDICT_CONFIG = {
  would_catch: {
    icon: ShieldCheck,
    label: "Would Catch",
    color: "text-emerald-400",
    bg: "bg-emerald-400/10 border-emerald-400/20",
    badge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  },
  would_miss: {
    icon: ShieldAlert,
    label: "Would Miss",
    color: "text-destructive",
    bg: "bg-destructive/10 border-destructive/20",
    badge: "bg-destructive/20 text-destructive border-destructive/30",
  },
  uncertain: {
    icon: ShieldQuestion,
    label: "Uncertain",
    color: "text-yellow-400",
    bg: "bg-yellow-400/10 border-yellow-400/20",
    badge: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  },
};

const CONFIDENCE_COLOR = {
  high: "text-emerald-400",
  medium: "text-yellow-400",
  low: "text-muted-foreground",
};

export function RegressionGuardPage() {
  const { toast } = useToast();
  const [testCode, setTestCode] = useState("");
  const [codeChanges, setCodeChanges] = useState("");
  const [bugDescription, setBugDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GuardResult | null>(null);

  const run = async () => {
    if (!testCode.trim() || !codeChanges.trim() || !bugDescription.trim()) {
      toast({ title: "All three fields are required", variant: "destructive" });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const r = await fetch(`${BASE}/api/tools/regression-guard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testCode, codeChanges, bugDescription }),
      });
      if (!r.ok) throw new Error("Request failed");
      const data = await r.json() as GuardResult;
      setResult(data);
    } catch {
      toast({ title: "Analysis failed. Try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const cfg = result ? VERDICT_CONFIG[result.verdict] : null;

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <ShieldCheck className="w-7 h-7 text-primary" /> Regression Guard
        </h1>
        <p className="text-muted-foreground mt-1">
          Determine whether an existing test would catch a regression introduced by specific code changes.
        </p>
      </div>

      <Card className="border-border/50 bg-card/50">
        <CardContent className="p-6 space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Test Code *
            </label>
            <Textarea
              value={testCode}
              onChange={e => setTestCode(e.target.value)}
              placeholder={`it('handles empty email', () => {
  expect(validateEmail('')).toBe(false);
});`}
              rows={6}
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Code Changes / Diff *
            </label>
            <Textarea
              value={codeChanges}
              onChange={e => setCodeChanges(e.target.value)}
              placeholder={`- if (!email) return false;
+ if (!email?.trim()) return false;`}
              rows={5}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">Paste a diff, patch, or describe the code change</p>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Bug Description *
            </label>
            <Textarea
              value={bugDescription}
              onChange={e => setBugDescription(e.target.value)}
              placeholder="Whitespace-only emails are incorrectly accepted by the login form"
              rows={2}
            />
          </div>
          <Button onClick={run} disabled={loading} className="w-full gap-2">
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Analysing…</> : <><ShieldCheck className="w-4 h-4" /> Analyse Regression Coverage</>}
          </Button>
        </CardContent>
      </Card>

      {result && cfg && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <Card className={`border ${cfg.bg}`}>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <cfg.icon className={`w-10 h-10 ${cfg.color}`} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-2xl font-bold ${cfg.color}`}>{cfg.label}</span>
                    <Badge variant="outline" className={`text-xs ${CONFIDENCE_COLOR[result.confidence]}`}>
                      {result.confidence} confidence
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{result.reasoning}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {result.criticalLines.length > 0 && (
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Lines the Test Exercises
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="space-y-1.5">
                  {result.criticalLines.map((l, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm font-mono bg-muted/30 rounded px-3 py-1.5">
                      <ArrowRight className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                      <span className="text-foreground/80">{l}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {result.missedScenarios.length > 0 && (
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-400" /> Missed Scenarios
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="space-y-1.5">
                  {result.missedScenarios.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="text-yellow-400 shrink-0">·</span> {s}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {result.recommendation && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-4 flex items-start gap-3">
                <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-primary mb-1">Recommendation</p>
                  <p className="text-sm text-foreground/80">{result.recommendation}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
