import { useGetAnalysisStats, useListAnalyses } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { StatusBadge } from "@/components/status-badge";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, CheckCircle, Clock, XCircle, ChevronRight, Plus } from "lucide-react";
import { motion } from "framer-motion";
import { AnimatedCounter } from "@/components/animated-counter";
import { ScrollReveal, StaggerContainer, StaggerItem } from "@/components/scroll-reveal";
import { TiltCard } from "@/components/tilt-card";

const STAT_CARD_VARIANTS = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  visible: (i: number) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { duration: 0.55, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] },
  }),
};

export function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetAnalysisStats();
  const { data: analyses, isLoading: analysesLoading } = useListAnalyses();

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Manage and monitor bug reproduction pipelines.</p>
        </div>
        <Link href="/new">
          <Button
            className="shadow-[0_0_20px_rgba(6,182,212,0.2)] hover:shadow-[0_0_35px_rgba(6,182,212,0.35)] transition-shadow"
            data-testid="new-analysis-btn"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Analysis
          </Button>
        </Link>
      </motion.div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            icon: Activity, label: "Total Runs",
            value: stats?.total || 0,
            color: "text-foreground",
            glow: "hover:shadow-[0_0_30px_rgba(255,255,255,0.05)]",
            iconColor: "text-muted-foreground",
          },
          {
            icon: CheckCircle, label: "Completed",
            value: stats?.completed || 0,
            color: "text-green-400",
            glow: "hover:shadow-[0_0_30px_rgba(74,222,128,0.12)]",
            iconColor: "text-green-400",
          },
          {
            icon: XCircle, label: "Failed",
            value: stats?.failed || 0,
            color: "text-destructive",
            glow: "hover:shadow-[0_0_30px_rgba(239,68,68,0.12)]",
            iconColor: "text-destructive",
          },
          {
            icon: Clock, label: "Avg Confidence",
            value: stats?.avgConfidence ? Math.round(stats.avgConfidence * 100) : 0,
            suffix: "%",
            color: "text-primary",
            glow: "hover:shadow-[0_0_30px_rgba(6,182,212,0.15)]",
            iconColor: "text-primary",
          },
        ].map(({ icon: Icon, label, value, suffix, color, glow, iconColor }, i) => (
          <motion.div
            key={label}
            custom={i}
            variants={STAT_CARD_VARIANTS}
            initial="hidden"
            animate="visible"
          >
            <TiltCard intensity={6} className="h-full">
              <div className={`h-full rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-5 transition-all duration-300 ${glow} group`}>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-medium text-muted-foreground">{label}</p>
                  <div className={`p-1.5 rounded-md bg-card border border-border/60 ${iconColor}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                </div>
                {statsLoading ? (
                  <Skeleton className="h-9 w-20" />
                ) : (
                  <p className={`text-4xl font-bold tracking-tight ${color}`}>
                    <AnimatedCounter value={value} suffix={suffix} />
                  </p>
                )}
              </div>
            </TiltCard>
          </motion.div>
        ))}
      </div>

      {/* Input Type Bar */}
      {!statsLoading && stats?.byInputType && stats.byInputType.length > 0 && (
        <ScrollReveal>
          <Card className="bg-card/50 backdrop-blur-sm border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Input Distribution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex h-3 w-full rounded-full overflow-hidden gap-0.5">
                {stats.byInputType.map((it, idx) => {
                  const colors = ['bg-primary', 'bg-blue-500', 'bg-cyan-400', 'bg-sky-500', 'bg-indigo-500', 'bg-teal-500'];
                  const percent = (it.count / (stats.total || 1)) * 100;
                  return (
                    <motion.div
                      key={it.inputType}
                      initial={{ width: 0 }}
                      animate={{ width: `${percent}%` }}
                      transition={{ duration: 0.8, delay: 0.2 + idx * 0.05, ease: [0.22, 1, 0.36, 1] }}
                      className={`h-full rounded-full ${colors[idx % colors.length]}`}
                      title={`${it.inputType}: ${it.count}`}
                    />
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                {stats.byInputType.map((it, idx) => {
                  const colors = ['bg-primary', 'bg-blue-500', 'bg-cyan-400', 'bg-sky-500', 'bg-indigo-500', 'bg-teal-500'];
                  return (
                    <div key={it.inputType} className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${colors[idx % colors.length]}`} />
                      <span>{it.inputType.replace("_", " ")} ({it.count})</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </ScrollReveal>
      )}

      {/* Recent Analyses */}
      <div className="space-y-4">
        <ScrollReveal>
          <h2 className="text-xl font-bold tracking-tight">Recent Analyses</h2>
        </ScrollReveal>

        <div className="flex flex-col gap-3">
          {analysesLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.08 }}>
                <Card className="bg-card/50">
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
              </motion.div>
            ))
          ) : analyses?.length === 0 ? (
            <ScrollReveal>
              <Card className="bg-card/50 backdrop-blur-sm border-dashed border-border/50">
                <CardContent className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
                  <Activity className="w-12 h-12 mb-4 opacity-20" />
                  <p>No analyses found. Start by creating a new one.</p>
                </CardContent>
              </Card>
            </ScrollReveal>
          ) : (
            <StaggerContainer className="flex flex-col gap-3" staggerDelay={0.07} containerDelay={0.1}>
              {analyses?.slice(0, 5).map((analysis) => (
                <StaggerItem key={analysis.id}>
                  <Link href={`/analyses/${analysis.id}`}>
                    <motion.div
                      whileHover={{ scale: 1.012, y: -2 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Card
                        className="bg-card/50 hover:bg-card/80 transition-all cursor-pointer border-border/50 hover:border-primary/30 hover:shadow-[0_0_20px_rgba(6,182,212,0.08)] group"
                        data-testid={`analysis-card-${analysis.id}`}
                      >
                        <CardContent className="p-5 flex items-center justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-1">
                              <h3 className="font-semibold text-lg truncate group-hover:text-primary transition-colors duration-200">{analysis.title}</h3>
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
                            <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all duration-200" />
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  </Link>
                </StaggerItem>
              ))}
            </StaggerContainer>
          )}
        </div>
      </div>
    </div>
  );
}
