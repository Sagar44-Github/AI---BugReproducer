import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Loader2, BookOpen, AlertTriangle, Info, TrendingUp,
  Lightbulb, Package, ChevronRight, BarChart3
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Highlight = { title: string; detail: string; type: "critical" | "info" | "warning" };

type DigestResult = {
  summary: string;
  highlights: Highlight[];
  patterns: string[];
  recommendations: string[];
  topComponents: string[];
  riskLevel: "critical" | "high" | "medium" | "low";
  statsNote: string;
};

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "all_time", label: "All time" },
];

const RISK_CONFIG = {
  critical: { color: "text-red-400", bg: "bg-red-500/10 border-red-500/20", badge: "bg-red-500/20 text-red-400" },
  high: { color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20", badge: "bg-orange-500/20 text-orange-400" },
  medium: { color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20", badge: "bg-yellow-500/20 text-yellow-400" },
  low: { color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", badge: "bg-emerald-500/20 text-emerald-400" },
};

const HIGHLIGHT_CONFIG = {
  critical: { icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/5 border-red-500/20" },
  warning: { icon: AlertTriangle, color: "text-yellow-400", bg: "bg-yellow-500/5 border-yellow-500/20" },
  info: { icon: Info, color: "text-blue-400", bg: "bg-blue-500/5 border-blue-500/20" },
};

export function BugDigestPage() {
  const { toast } = useToast();
  const [period, setPeriod] = useState("last_7_days");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DigestResult | null>(null);
  const [lastPeriod, setLastPeriod] = useState("");

  const generate = async () => {
    setLoading(true);
    setResult(null);
    try {
      const r = await fetch(`${BASE}/api/tools/bug-digest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period }),
      });
      if (!r.ok) throw new Error("Request failed");
      const data = await r.json() as DigestResult;
      setResult(data);
      setLastPeriod(PERIODS.find(p => p.value === period)?.label ?? period);
    } catch {
      toast({ title: "Failed to generate digest. Try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const risk = result ? RISK_CONFIG[result.riskLevel] ?? RISK_CONFIG.low : null;

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <BookOpen className="w-7 h-7 text-primary" /> Bug Digest
        </h1>
        <p className="text-muted-foreground mt-1">
          AI-generated executive summary of all bugs in a time period.
        </p>
      </div>

      <Card className="border-border/50 bg-card/50">
        <CardContent className="p-6">
          <div className="flex items-end gap-4">
            <div className="flex-1 space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Period</label>
              <div className="flex gap-2 flex-wrap">
                {PERIODS.map(p => (
                  <button
                    key={p.value}
                    onClick={() => setPeriod(p.value)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      period === p.value
                        ? "bg-primary/20 text-primary border-primary/30"
                        : "bg-card border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <Button onClick={generate} disabled={loading} className="gap-2 shrink-0">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</> : <><BarChart3 className="w-4 h-4" /> Generate Digest</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading && (
        <div className="space-y-4">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      )}

      {result && risk && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Digest — {lastPeriod}</h2>
            <Badge className={`${risk.badge} border font-medium`}>
              {result.riskLevel} risk
            </Badge>
          </div>

          <Card className={`border ${risk.bg}`}>
            <CardContent className="p-5">
              <p className="text-sm leading-relaxed">{result.summary}</p>
              {result.statsNote && (
                <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border/50">{result.statsNote}</p>
              )}
            </CardContent>
          </Card>

          {result.highlights.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {result.highlights.map((h, i) => {
                const hcfg = HIGHLIGHT_CONFIG[h.type] ?? HIGHLIGHT_CONFIG.info;
                return (
                  <Card key={i} className={`border ${hcfg.bg}`}>
                    <CardContent className="p-4 flex items-start gap-3">
                      <hcfg.icon className={`w-4 h-4 ${hcfg.color} shrink-0 mt-0.5`} />
                      <div>
                        <p className={`text-xs font-semibold ${hcfg.color}`}>{h.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{h.detail}</p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {result.patterns.length > 0 && (
              <Card className="border-border/50 bg-card/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" /> Patterns
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {result.patterns.map((p, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <ChevronRight className="w-3.5 h-3.5 text-primary/50 shrink-0 mt-0.5" />
                      {p}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {result.recommendations.length > 0 && (
              <Card className="border-border/50 bg-card/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-yellow-400" /> Recommendations
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {result.recommendations.map((r, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <ChevronRight className="w-3.5 h-3.5 text-yellow-400/50 shrink-0 mt-0.5" />
                      {r}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {result.topComponents.length > 0 && (
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Package className="w-4 h-4 text-primary" /> Most Affected Components
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 flex flex-wrap gap-2">
                {result.topComponents.map((c, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">{c}</Badge>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
