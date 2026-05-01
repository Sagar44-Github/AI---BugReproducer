import { useGetAnalysisStats, useListAnalyses } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { StatusBadge } from "@/components/status-badge";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, CheckCircle, Clock, XCircle, ChevronRight, Plus } from "lucide-react";

export function Home() {
  const { data: stats, isLoading: statsLoading } = useGetAnalysisStats();
  const { data: analyses, isLoading: analysesLoading } = useListAnalyses();

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analyses</h1>
          <p className="text-muted-foreground mt-1">Manage and monitor bug reproduction pipelines.</p>
        </div>
        <Link href="/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Analysis
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
              <CheckCircle className="w-4 h-4" /> Completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? <Skeleton className="h-8 w-16" /> : <div className="text-3xl font-bold text-green-500">{stats?.completed || 0}</div>}
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <XCircle className="w-4 h-4" /> Failed
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? <Skeleton className="h-8 w-16" /> : <div className="text-3xl font-bold text-destructive">{stats?.failed || 0}</div>}
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4" /> Avg Confidence
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? <Skeleton className="h-8 w-16" /> : <div className="text-3xl font-bold text-primary">{stats?.avgConfidence ? `${Math.round(stats.avgConfidence * 100)}%` : '-'}</div>}
          </CardContent>
        </Card>
      </div>

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
          ) : analyses?.length === 0 ? (
            <Card className="bg-card/50 backdrop-blur-sm border-dashed border-border/50">
              <CardContent className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
                <Activity className="w-12 h-12 mb-4 opacity-20" />
                <p>No analyses found. Start by creating a new one.</p>
              </CardContent>
            </Card>
          ) : (
            analyses?.map((analysis) => (
              <Link key={analysis.id} href={`/analyses/${analysis.id}`}>
                <Card className="bg-card/50 hover:bg-card/80 transition-colors cursor-pointer border-border/50 group">
                  <CardContent className="p-5 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold text-lg truncate group-hover:text-primary transition-colors">{analysis.title}</h3>
                        <StatusBadge status={analysis.status} />
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                          {analysis.inputType.replace("_", " ")}
                        </span>
                        <span>{format(new Date(analysis.createdAt), "MMM d, yyyy HH:mm")}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      {analysis.confidenceScore !== null && analysis.confidenceScore !== undefined && (
                        <div className="text-right hidden sm:block">
                          <div className="text-xs text-muted-foreground mb-0.5">Confidence</div>
                          <div className="font-mono font-medium text-primary">{Math.round(analysis.confidenceScore * 100)}%</div>
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
