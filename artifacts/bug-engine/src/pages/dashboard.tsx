import { useState, useEffect } from "react";
import { useGetAnalysisStats, useListAnalyses } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { StatusBadge } from "@/components/status-badge";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity, CheckCircle, Clock, XCircle, ChevronRight, Plus, TrendingUp, BarChart3
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from "recharts";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type TrendRow = {
  date: string;
  total: number;
  completed: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  avgConfidence: number | null;
};

type Period = "7" | "30" | "90";

const PERIOD_LABELS: Record<Period, string> = { "7": "7 days", "30": "30 days", "90": "90 days" };

function useTrends(days: Period) {
  const [data, setData] = useState<TrendRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${BASE}/api/analyses/trends?days=${days}`)
      .then(r => r.json())
      .then((rows: TrendRow[]) => { setData(rows); setLoading(false); })
      .catch(() => setLoading(false));
  }, [days]);

  return { data, loading };
}

function TrendsChart({ data, loading }: { data: TrendRow[]; loading: boolean }) {
  if (loading) return <Skeleton className="h-52 w-full rounded-xl" />;
  if (data.length === 0) {
    return (
      <div className="h-52 flex items-center justify-center text-muted-foreground/40 text-sm">
        No data for this period
      </div>
    );
  }
  const formatted = data.map(r => ({
    ...r,
    date: format(new Date(r.date), "MMM d"),
  }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={formatted} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradCompleted" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
        />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        <Area type="monotone" dataKey="total" name="Total" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#gradTotal)" />
        <Area type="monotone" dataKey="completed" name="Completed" stroke="#22c55e" strokeWidth={2} fill="url(#gradCompleted)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function SeverityChart({ data, loading }: { data: TrendRow[]; loading: boolean }) {
  if (loading) return <Skeleton className="h-52 w-full rounded-xl" />;
  if (data.length === 0) {
    return (
      <div className="h-52 flex items-center justify-center text-muted-foreground/40 text-sm">
        No data for this period
      </div>
    );
  }
  const formatted = data.map(r => ({ ...r, date: format(new Date(r.date), "MMM d") }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={formatted} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
        />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="critical" name="Critical" fill="#ef4444" stackId="s" radius={[0, 0, 0, 0]} />
        <Bar dataKey="high" name="High" fill="#f97316" stackId="s" />
        <Bar dataKey="medium" name="Medium" fill="#eab308" stackId="s" />
        <Bar dataKey="low" name="Low" fill="#22c55e" stackId="s" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetAnalysisStats();
  const { data: analyses, isLoading: analysesLoading } = useListAnalyses();
  const [period, setPeriod] = useState<Period>("30");
  const { data: trends, loading: trendsLoading } = useTrends(period);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Monitor and manage bug reproduction pipelines.</p>
        </div>
        <Link href="/new">
          <Button data-testid="new-analysis-btn">
            <Plus className="w-4 h-4 mr-2" />
            New Analysis
          </Button>
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Activity className="w-4 h-4" /> Total Runs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? <Skeleton className="h-8 w-16" /> : <div className="text-3xl font-bold">{stats?.total || 0}</div>}
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" /> Completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? <Skeleton className="h-8 w-16" /> : <div className="text-3xl font-bold text-green-500">{stats?.completed || 0}</div>}
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <XCircle className="w-4 h-4 text-destructive" /> Failed
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? <Skeleton className="h-8 w-16" /> : <div className="text-3xl font-bold text-destructive">{stats?.failed || 0}</div>}
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" /> Avg Confidence
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? <Skeleton className="h-8 w-16" /> : (
              <div className="text-3xl font-bold text-primary">
                {stats?.avgConfidence ? `${Math.round(stats.avgConfidence * 100)}%` : "—"}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trend charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> Analysis Volume
              </CardTitle>
              <div className="flex gap-1">
                {(["7", "30", "90"] as Period[]).map(p => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-2 py-0.5 text-xs rounded font-medium transition-colors ${
                      period === p
                        ? "bg-primary/20 text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {PERIOD_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <TrendsChart data={trends} loading={trendsLoading} />
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> Severity Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <SeverityChart data={trends} loading={trendsLoading} />
          </CardContent>
        </Card>
      </div>

      {/* Input type bar */}
      {!statsLoading && stats?.byInputType && stats.byInputType.length > 0 && (
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Input Types</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-3 w-full rounded-full overflow-hidden mb-2">
              {stats.byInputType.map((it, idx) => {
                const colors = ["bg-primary", "bg-blue-500", "bg-cyan-500", "bg-sky-500", "bg-indigo-500", "bg-teal-500", "bg-violet-500", "bg-pink-500", "bg-orange-500", "bg-emerald-500"];
                const percent = (it.count / (stats.total || 1)) * 100;
                return (
                  <div key={it.inputType} style={{ width: `${percent}%` }} className={colors[idx % colors.length]} title={`${it.inputType}: ${it.count}`} />
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              {stats.byInputType.map((it, idx) => {
                const colors = ["bg-primary", "bg-blue-500", "bg-cyan-500", "bg-sky-500", "bg-indigo-500", "bg-teal-500", "bg-violet-500", "bg-pink-500", "bg-orange-500", "bg-emerald-500"];
                return (
                  <div key={it.inputType} className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${colors[idx % colors.length]}`} />
                    <span>{it.inputType.replace(/_/g, " ")} ({it.count})</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent analyses */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight">Recent Analyses</h2>
        <div className="flex flex-col gap-3">
          {analysesLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="bg-card/50">
                <CardContent className="p-6">
                  <div className="flex justify-between items-center">
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-48" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                    <Skeleton className="h-8 w-24" />
                  </div>
                </CardContent>
              </Card>
            ))
          ) : !analyses || analyses.length === 0 ? (
            <Card className="bg-card/50 backdrop-blur-sm border-dashed border-border/50">
              <CardContent className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
                <Activity className="w-12 h-12 mb-4 opacity-20" />
                <p>No analyses yet. Start by creating a new one.</p>
              </CardContent>
            </Card>
          ) : (
            analyses.slice(0, 6).map(analysis => (
              <Link key={analysis.id} href={`/analyses/${analysis.id}`}>
                <Card className="bg-card/50 hover:bg-card/80 transition-colors cursor-pointer border-border/50 group" data-testid={`analysis-card-${analysis.id}`}>
                  <CardContent className="p-5 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1 flex-wrap">
                        <h3 className="font-semibold text-base truncate group-hover:text-primary transition-colors">{analysis.title}</h3>
                        <StatusBadge status={analysis.status} />
                        {analysis.severity && (
                          <Badge
                            variant="outline"
                            className={`text-xs ${
                              analysis.severity === "critical" ? "border-red-500/40 text-red-400" :
                              analysis.severity === "high" ? "border-orange-500/40 text-orange-400" :
                              analysis.severity === "medium" ? "border-yellow-500/40 text-yellow-400" :
                              "border-emerald-500/40 text-emerald-400"
                            }`}
                          >
                            {analysis.severity}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                          {analysis.inputType.replace(/_/g, " ")}
                        </span>
                        <span>{format(new Date(analysis.createdAt), "MMM d, yyyy HH:mm")}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      {analysis.confidenceScore != null && (
                        <div className="text-right hidden sm:block">
                          <div className="text-xs text-muted-foreground mb-0.5">Confidence</div>
                          <div className="font-mono font-semibold text-primary">{Math.round(analysis.confidenceScore * 100)}%</div>
                        </div>
                      )}
                      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
