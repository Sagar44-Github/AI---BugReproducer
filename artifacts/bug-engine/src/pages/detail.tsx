import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAnalysis,
  getGetAnalysisQueryKey,
  useDeleteAnalysis
} from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, BugPlay, Loader2, CheckCircle2, AlertCircle,
  Code2, GitMerge, Search, FileText, Trash2, StopCircle,
  ShieldAlert, ShieldCheck, ShieldQuestion, Shield,
  ChevronDown, ChevronUp, Users, MessageSquare, Clock,
  Network, CheckCheck, XCircle, HelpCircle, PenLine,
  RefreshCw, Send, Bot
} from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";

type AgentEvent = {
  type:
    | "agent_start"
    | "agent_output"
    | "agent_done"
    | "agent_validated"
    | "agent_retry"
    | "pipeline_done"
    | "error";
  agentName: string;
  content: string;
};

type AgentState = {
  name: string;
  status: "pending" | "running" | "completed" | "error";
  output: string;
  validated?: boolean;
  retried?: boolean;
  validationError?: string;
};

type ConfidenceBreakdown = {
  score: number;
  rubric?: Record<string, number>;
  missing: string[];
  evidence: string[];
  assumptions: string[];
};

type AuditEntry = {
  timestamp: string;
  agent: string;
  action: string;
  decision: string;
  rationale: string;
};

type CorrelationMatch = {
  id: number;
  title: string;
  similarity: number;
  commonFactors: string[];
  rootCauseNote: string;
  createdAt: string;
};

type Annotation = {
  id: number;
  analysisId: number;
  authorName: string;
  type: "note" | "verified" | "failed" | "question";
  stepRef: string | null;
  content: string;
  createdAt: string;
};

// ─── Structured tab renderers ─────────────────────────────────────────────────
// Each component tries to parse the stored JSON from the new validated pipeline.
// If the field is legacy markdown text, it falls back gracefully to raw rendering.

type HypothesisItem = {
  id: string;
  title: string;
  mechanism: string;
  likelihood: "high" | "medium" | "low";
  confirmingEvidence: string[];
  refutingEvidence: string[];
  status: "retained" | "eliminated";
  statusReason: string;
};

function StructuredHypotheses({ raw }: { raw: string }) {
  const hypotheses = useMemo<HypothesisItem[] | null>(() => {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as HypothesisItem[]) : null;
    } catch { return null; }
  }, [raw]);

  if (!hypotheses) {
    return <div className="whitespace-pre-wrap text-muted-foreground text-sm">{raw}</div>;
  }

  const likelihoodStyle: Record<string, string> = {
    high: "bg-red-500/20 text-red-400 border-red-500/30",
    medium: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    low: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  };

  return (
    <div className="space-y-4">
      {hypotheses.map((h, i) => (
        <div
          key={i}
          className={`rounded-lg border p-4 space-y-3 transition-opacity ${
            h.status === "retained"
              ? "border-primary/30 bg-primary/5"
              : "border-border/50 bg-muted/20 opacity-60"
          }`}
        >
          <div className="flex items-start gap-3 justify-between flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-mono text-muted-foreground shrink-0">{h.id}</span>
              <span className="font-semibold text-sm">{h.title}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge
                variant="outline"
                className={`text-xs ${likelihoodStyle[h.likelihood] ?? ""}`}
              >
                {h.likelihood}
              </Badge>
              <Badge
                variant="outline"
                className={`text-xs font-mono ${
                  h.status === "retained"
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                    : "bg-red-500/20 text-red-400 border-red-500/30"
                }`}
              >
                {h.status}
              </Badge>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{h.mechanism}</p>
          {h.confirmingEvidence.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {h.confirmingEvidence.map((e, ei) => (
                <span
                  key={ei}
                  className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded px-2 py-0.5"
                >
                  + {e}
                </span>
              ))}
            </div>
          )}
          {h.refutingEvidence.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {h.refutingEvidence.map((e, ei) => (
                <span
                  key={ei}
                  className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 rounded px-2 py-0.5"
                >
                  − {e}
                </span>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground border-t border-border/30 pt-2">
            {h.statusReason}
          </p>
        </div>
      ))}
    </div>
  );
}

type ReproStep = { number: number; action: string; expectedOutcome?: string };
type StepData = {
  prerequisites: string[];
  steps: ReproStep[];
  expectedResult: string;
  actualResult: string;
  environmentConfig?: string[];
  validationNotes?: string[];
  confidenceRating: number;
};

function StructuredReproSteps({ raw }: { raw: string }) {
  const data = useMemo<StepData | null>(() => {
    try {
      const parsed = JSON.parse(raw) as StepData;
      return parsed.steps && Array.isArray(parsed.steps) ? parsed : null;
    } catch { return null; }
  }, [raw]);

  if (!data) {
    return (
      <div className="bg-[#0a0a0a] rounded-lg p-6 font-mono text-sm whitespace-pre-wrap text-gray-300">
        {raw}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {data.prerequisites.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Prerequisites
          </h3>
          <ul className="space-y-1.5">
            {data.prerequisites.map((p, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="text-primary shrink-0">•</span>
                <span className="text-muted-foreground">{p}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Reproduction Steps
        </h3>
        <div className="space-y-3">
          {data.steps.map((step) => (
            <div key={step.number} className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-xs font-bold text-primary shrink-0 mt-0.5">
                {step.number}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">{step.action}</p>
                {step.expectedOutcome && (
                  <p className="text-xs text-muted-foreground mt-0.5 italic">
                    Expected: {step.expectedOutcome}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-3">
          <p className="text-xs font-semibold text-emerald-400 mb-1 uppercase tracking-wide">Expected Result</p>
          <p className="text-sm text-muted-foreground">{data.expectedResult}</p>
        </div>
        <div className="rounded border border-red-500/30 bg-red-500/5 p-3">
          <p className="text-xs font-semibold text-red-400 mb-1 uppercase tracking-wide">Actual Result</p>
          <p className="text-sm text-muted-foreground">{data.actualResult}</p>
        </div>
      </div>

      {data.environmentConfig && data.environmentConfig.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Environment Config
          </h3>
          <ul className="space-y-1">
            {data.environmentConfig.map((e, i) => (
              <li key={i} className="text-xs font-mono text-cyan-400 bg-cyan-500/5 border border-cyan-500/20 rounded px-2 py-1">
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.validationNotes && data.validationNotes.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Validation Notes
          </h3>
          <ul className="space-y-1.5">
            {data.validationNotes.map((n, i) => (
              <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                <span className="text-amber-400 shrink-0">→</span>{n}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-2 text-sm border-t border-border/50 pt-3">
        <span className="text-muted-foreground text-xs">Reproduction Confidence:</span>
        <span className="font-bold text-primary font-mono">{data.confidenceRating}/10</span>
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${data.confidenceRating * 10}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function StructuredQuestions({ raw }: { raw: string }) {
  const questions = useMemo<string[] | null>(() => {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as string[]) : null;
    } catch { return null; }
  }, [raw]);

  if (!questions) {
    return (
      <div className="bg-muted/20 rounded-lg border border-border/50 p-5 font-mono text-sm whitespace-pre-wrap text-muted-foreground leading-relaxed">
        {raw}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {questions.map((q, i) => (
        <div
          key={i}
          className="flex gap-3 p-3 rounded border border-border/50 bg-muted/20 hover:bg-muted/30 transition-colors"
        >
          <span className="w-6 h-6 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-xs font-bold text-primary shrink-0 mt-0.5">
            {i + 1}
          </span>
          <p className="text-sm text-muted-foreground">{q}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  critical: { label: "Critical", color: "text-red-400", bg: "bg-red-500/10 border-red-500/30", Icon: ShieldAlert },
  high: { label: "High", color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/30", Icon: ShieldAlert },
  medium: { label: "Medium", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/30", Icon: ShieldQuestion },
  low: { label: "Low", color: "text-green-400", bg: "bg-green-500/10 border-green-500/30", Icon: ShieldCheck },
};

const ANNOTATION_CONFIG = {
  note: { label: "Note", icon: PenLine, color: "text-blue-400" },
  verified: { label: "Verified", icon: CheckCheck, color: "text-green-400" },
  failed: { label: "Failed", icon: XCircle, color: "text-red-400" },
  question: { label: "Question", icon: HelpCircle, color: "text-amber-400" },
};

export function AnalysisDetail() {
  const [, params] = useRoute("/analyses/:id");
  const id = params?.id ? parseInt(params.id, 10) : 0;
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: analysis, isLoading, isError } = useGetAnalysis(id, {
    query: { enabled: !!id, queryKey: getGetAnalysisQueryKey(id) }
  });

  const deleteAnalysis = useDeleteAnalysis();

  const [isRunning, setIsRunning] = useState(false);
  const [agents, setAgents] = useState<Record<string, AgentState>>({});
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Confidence breakdown
  const [showConfidenceDetails, setShowConfidenceDetails] = useState(false);
  const confidenceBreakdown: ConfidenceBreakdown | null = (() => {
    try { return analysis?.confidenceBreakdown ? JSON.parse(analysis.confidenceBreakdown) : null; } catch { return null; }
  })();

  // Animate the progress bar from 0 → actual score when the card first appears
  const [animatedScore, setAnimatedScore] = useState(0);
  useEffect(() => {
    if (!confidenceBreakdown) return;
    setAnimatedScore(0);
    const t = setTimeout(() => setAnimatedScore(confidenceBreakdown.score), 120);
    return () => clearTimeout(t);
  }, [confidenceBreakdown?.score]);

  // Audit trail
  const auditTrail: AuditEntry[] = (() => {
    try { return analysis?.auditTrail ? JSON.parse(analysis.auditTrail) : []; } catch { return []; }
  })();

  // Correlations
  const [correlations, setCorrelations] = useState<CorrelationMatch[]>([]);
  const [correlationsLoading, setCorrelationsLoading] = useState(false);
  const [correlationsFetched, setCorrelationsFetched] = useState(false);

  const fetchCorrelations = useCallback(async () => {
    if (!id || correlationsFetched) return;
    setCorrelationsLoading(true);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/analyses/${id}/correlations`);
      const data = await res.json() as CorrelationMatch[];
      setCorrelations(data);
    } catch {
      // ignore
    } finally {
      setCorrelationsLoading(false);
      setCorrelationsFetched(true);
    }
  }, [id, correlationsFetched]);

  // Collaboration
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [annotationsLoaded, setAnnotationsLoaded] = useState(false);
  const [collaboratorCount, setCollaboratorCount] = useState(1);
  const [authorName, setAuthorName] = useState("You");
  const [annotationType, setAnnotationType] = useState<"note" | "verified" | "failed" | "question">("note");
  const [annotationContent, setAnnotationContent] = useState("");
  const [annotationStepRef, setAnnotationStepRef] = useState("");
  const [submittingAnnotation, setSubmittingAnnotation] = useState(false);
  const collaborateSSERef = useRef<EventSource | null>(null);

  const loadAnnotations = useCallback(async () => {
    if (!id || annotationsLoaded) return;
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/analyses/${id}/annotations`);
      const data = await res.json() as Annotation[];
      setAnnotations(data);
      setAnnotationsLoaded(true);
    } catch {
      // ignore
    }
  }, [id, annotationsLoaded]);

  const connectCollaboration = useCallback(() => {
    if (collaborateSSERef.current) return;
    const es = new EventSource(`${import.meta.env.BASE_URL}api/analyses/${id}/collaborate`);
    collaborateSSERef.current = es;
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "connected") setCollaboratorCount(data.collaboratorCount);
        if (data.type === "annotation") {
          setAnnotations(prev => [...prev, data.annotation as Annotation]);
        }
      } catch { /* ignore */ }
    };
    es.onerror = () => {
      es.close();
      collaborateSSERef.current = null;
    };
  }, [id]);

  useEffect(() => {
    return () => {
      collaborateSSERef.current?.close();
    };
  }, []);

  const submitAnnotation = async () => {
    if (!annotationContent.trim()) return;
    setSubmittingAnnotation(true);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/analyses/${id}/annotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorName: authorName.trim() || "Anonymous",
          type: annotationType,
          stepRef: annotationStepRef.trim() || undefined,
          content: annotationContent.trim(),
        }),
      });
      if (res.ok) {
        const annotation = await res.json() as Annotation;
        setAnnotations(prev => [...prev, annotation]);
        setAnnotationContent("");
        setAnnotationStepRef("");
        toast({ title: "Annotation added" });
      }
    } catch {
      toast({ variant: "destructive", title: "Failed to add annotation" });
    } finally {
      setSubmittingAnnotation(false);
    }
  };

  const startPipeline = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setAgents({});
    setPipelineError(null);
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/analyses/${id}/run`, {
        method: "POST",
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) throw new Error(`Failed to start pipeline: ${response.statusText}`);

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event: AgentEvent = JSON.parse(line.slice(6));

              if (event.type === "pipeline_done") {
                queryClient.invalidateQueries({ queryKey: getGetAnalysisQueryKey(id) });
                setIsRunning(false);
                setCorrelationsFetched(false);
                toast({ title: "Pipeline Complete", description: "Bug reproduction analysis finished successfully." });
                break;
              }

              if (event.type === "error") {
                setPipelineError(event.content);
                setIsRunning(false);
                queryClient.invalidateQueries({ queryKey: getGetAnalysisQueryKey(id) });
                break;
              }

              if (event.type === "agent_validated") {
                const canonical = event.agentName.replace(/ \[correction\]$/, "");
                setAgents(prev => {
                  const key = Object.keys(prev).find(k => k === canonical || k === event.agentName) ?? canonical;
                  if (!prev[key]) return prev;
                  return { ...prev, [key]: { ...prev[key], validated: true } };
                });
                continue;
              }

              if (event.type === "agent_retry") {
                const canonical = event.agentName.replace(/ \[correction\]$/, "");
                setAgents(prev => {
                  const key = Object.keys(prev).find(k => k === canonical || k === event.agentName) ?? canonical;
                  if (!prev[key]) return prev;
                  return { ...prev, [key]: { ...prev[key], retried: true, validationError: event.content } };
                });
                continue;
              }

              if (event.agentName) {
                const canonical = event.agentName.replace(/ \[correction\]$/, "");
                setAgents(prev => {
                  const key = Object.keys(prev).find(k => k === canonical) ?? canonical;
                  const cur = prev[key] || { name: canonical, status: "pending" as const, output: "" };
                  return {
                    ...prev,
                    [key]: {
                      ...cur,
                      name: canonical,
                      status: event.type === "agent_start" ? "running"
                        : event.type === "agent_done" ? "completed"
                        : event.type === "error" ? "error"
                        : "running",
                      output: event.type === "agent_output" ? cur.output + event.content : cur.output,
                    }
                  };
                });
              }
            } catch { /* ignore parse errors */ }
          }
        }
      }
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      if (e.name !== "AbortError") {
        setPipelineError(e.message || "An unexpected error occurred");
        toast({ variant: "destructive", title: "Pipeline Error", description: e.message || "Failed to run analysis pipeline" });
      }
      setIsRunning(false);
      queryClient.invalidateQueries({ queryKey: getGetAnalysisQueryKey(id) });
    }
  };

  const stopPipeline = () => {
    abortControllerRef.current?.abort();
    setIsRunning(false);
    toast({ title: "Pipeline Stopped", description: "The analysis run was manually cancelled." });
  };

  const handleDelete = () => {
    deleteAnalysis.mutate({ id }, {
      onSuccess: () => { toast({ title: "Analysis deleted" }); setLocation("/dashboard"); },
      onError: (err) => {
        toast({ variant: "destructive", title: "Error deleting", description: (err as unknown as { error?: string }).error || "Unknown error" });
      }
    });
  };

  const outputEndRefs = useRef<Record<string, HTMLDivElement | null>>({});
  useEffect(() => {
    Object.values(agents).forEach(agent => {
      if (agent.status === "running") outputEndRefs.current[agent.name]?.scrollIntoView({ behavior: "smooth" });
    });
  }, [agents]);

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex gap-4"><Skeleton className="w-8 h-8 rounded-md" /><div className="space-y-2 flex-1"><Skeleton className="h-8 w-1/3" /><Skeleton className="h-4 w-1/4" /></div></div>
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (isError || !analysis) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
        <h2 className="text-2xl font-bold">Analysis Not Found</h2>
        <p className="text-muted-foreground mt-2 mb-6">This analysis might have been deleted or doesn't exist.</p>
        <Link href="/dashboard"><Button variant="outline">Return to Dashboard</Button></Link>
      </div>
    );
  }

  const hasResults = analysis.status === "completed" || analysis.status === "failed";
  const agentList = Object.values(agents);
  const severityCfg = analysis.severity ? SEVERITY_CONFIG[analysis.severity as keyof typeof SEVERITY_CONFIG] : null;

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="flex gap-4 items-start flex-1 min-w-0">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 mt-1"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight truncate">{analysis.title}</h1>
              <StatusBadge status={analysis.status} />
              {severityCfg && (
                <Badge variant="outline" className={`border text-xs ${severityCfg.bg} ${severityCfg.color}`}>
                  <severityCfg.Icon className="w-3 h-3 mr-1" />
                  {severityCfg.label}
                </Badge>
              )}
              {analysis.confidenceScore != null && (
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs">
                  {Math.round(analysis.confidenceScore * 100)}% confidence
                </Badge>
              )}
            </div>
            <div className="text-sm text-muted-foreground flex items-center gap-4 flex-wrap">
              <span>{analysis.inputType.replace(/_/g, " ")}</span>
              <span>•</span>
              <span>{format(new Date(analysis.createdAt), "PP pp")}</span>
              {analysis.severityReason && severityCfg && (
                <><span>•</span><span className={`text-xs ${severityCfg.color}`}>{analysis.severityReason}</span></>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end md:self-start mt-2 md:mt-0">
          {hasResults && (
            <Link href={`/analyses/${id}/export`}>
              <Button variant="outline" size="sm" className="gap-2"><FileText className="w-4 h-4" />Report</Button>
            </Link>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10 border-destructive/20">
                <Trash2 className="w-4 h-4 mr-2" />Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Analysis</AlertDialogTitle>
                <AlertDialogDescription>Are you sure you want to delete this analysis? This action cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {!isRunning ? (
            <Button onClick={startPipeline} className="font-mono bg-primary text-primary-foreground hover:bg-primary/90">
              <BugPlay className="w-4 h-4 mr-2" />
              {hasResults ? "Rerun Pipeline" : "Run Pipeline"}
            </Button>
          ) : (
            <Button onClick={stopPipeline} variant="destructive" className="font-mono">
              <StopCircle className="w-4 h-4 mr-2" />Stop Run
            </Button>
          )}
        </div>
      </div>

      {/* Confidence Breakdown — Deterministic Rubric */}
      {confidenceBreakdown && (
        <Card className="border-primary/20">
          <button
            className="w-full px-5 py-4 flex items-center justify-between text-left"
            onClick={() => setShowConfidenceDetails(v => !v)}
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Shield className="w-5 h-5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-semibold text-sm">Confidence Score</span>
                  <span className="font-mono font-bold text-primary text-sm">{confidenceBreakdown.score}%</span>
                  <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20 font-mono">
                    deterministic rubric
                  </Badge>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-48">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{
                        width: `${animatedScore}%`,
                        transition: "width 1s cubic-bezier(0.4, 0, 0.2, 1)",
                      }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {confidenceBreakdown.missing.length === 0
                      ? "All rubric factors present"
                      : `${confidenceBreakdown.missing.length} factor${confidenceBreakdown.missing.length > 1 ? "s" : ""} missing`}
                  </span>
                </div>
              </div>
            </div>
            {showConfidenceDetails ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
          </button>
          <AnimatePresence>
            {showConfidenceDetails && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden border-t border-border/50"
              >
                <div className="p-5 space-y-5">
                  {/* Rubric factor grid */}
                  {confidenceBreakdown.rubric && (
                    <div>
                      <h4 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-3">
                        Scoring Rubric — {Object.values(confidenceBreakdown.rubric).reduce((a, b) => a + b, 0)} raw pts → {confidenceBreakdown.score}/100
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {(Object.entries(confidenceBreakdown.rubric) as [string, number][]).map(([key, pts]) => {
                          const maxPts: Record<string, number> = {
                            environment: 20, frequency: 15, stack_trace: 25,
                            expected_behavior: 15, similar_bug: 20, code_snippet: 10,
                            reproduction_steps: 15,
                          };
                          const labels: Record<string, string> = {
                            environment: "Environment specified",
                            frequency: "Frequency known",
                            stack_trace: "Stack trace present",
                            expected_behavior: "Expected behavior stated",
                            similar_bug: "Similar historical bug",
                            code_snippet: "Code snippet provided",
                            reproduction_steps: "Repro steps given",
                          };
                          const subtitles: Record<string, string> = {
                            stack_trace: "minified — partial credit",
                          };
                          const max = maxPts[key] ?? 0;
                          const earned = pts > 0;
                          const isPartial = earned && pts < max;
                          const cardClass = isPartial
                            ? "border-amber-500/30 bg-amber-500/5"
                            : earned
                              ? "border-emerald-500/30 bg-emerald-500/5"
                              : "border-border/40 bg-muted/20 opacity-60";
                          const dotClass = isPartial
                            ? "bg-amber-400"
                            : earned
                              ? "bg-emerald-400"
                              : "bg-muted-foreground/30";
                          const numClass = isPartial
                            ? "text-amber-400"
                            : earned
                              ? "text-emerald-400"
                              : "text-muted-foreground";
                          return (
                            <div
                              key={key}
                              className={`flex items-center gap-3 rounded px-3 py-2 border text-xs ${cardClass}`}
                            >
                              <div className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
                              <span className="flex-1 text-foreground">
                                {labels[key] ?? key.replace(/_/g, " ")}
                                {isPartial && subtitles[key] && (
                                  <span className="ml-1.5 text-amber-400/70 font-normal">({subtitles[key]})</span>
                                )}
                              </span>
                              <span className={`font-mono font-bold shrink-0 ${numClass}`}>
                                +{pts}<span className="text-muted-foreground font-normal">/{max}</span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* AI Qualitative Context — clearly separated from the deterministic rubric */}
                  {(confidenceBreakdown.evidence.length > 0 || confidenceBreakdown.assumptions.length > 0) && (
                    <div className="rounded border border-dashed border-border/50 bg-muted/10 p-4">
                      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/30">
                        <Bot className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          AI Qualitative Context
                        </span>
                        <span className="ml-auto text-xs text-muted-foreground/60 font-mono italic">
                          does not affect score
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {confidenceBreakdown.evidence.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-muted-foreground mb-2">Supporting observations</h4>
                            <ul className="space-y-1.5">
                              {confidenceBreakdown.evidence.map((e, i) => (
                                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0 mt-0.5" />
                                  {e}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {confidenceBreakdown.assumptions.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-muted-foreground mb-2">Assumptions made</h4>
                            <ul className="space-y-1.5">
                              {confidenceBreakdown.assumptions.map((a, i) => (
                                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                                  <AlertCircle className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0 mt-0.5" />
                                  {a}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      )}

      {/* Original Input */}
      <Card className="bg-card border-border/50 shadow-sm">
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Original Context</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="max-h-64 bg-black/40 rounded-b-lg">
            <div className="p-4 font-mono text-sm whitespace-pre-wrap text-muted-foreground">{analysis.rawInput}</div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Live Pipeline View */}
      {(isRunning || agentList.length > 0) && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Search className="w-5 h-5 text-primary" />
            Pipeline Execution
          </h2>
          <div className="grid gap-4">
            <AnimatePresence initial={false}>
              {agentList.map((agent) => (
                <motion.div key={agent.name} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                  <Card className={`border-border/50 overflow-hidden ${agent.status === "running" ? "ring-1 ring-primary/50" : ""}`}>
                    <div className="bg-muted/30 px-4 py-3 flex items-center justify-between border-b border-border/50">
                      <div className="flex items-center gap-2 font-mono text-sm font-semibold">
                        <Code2 className="w-4 h-4 text-primary" />{agent.name}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        {agent.retried && (
                          <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-400 border-amber-500/30 font-mono">
                            <RefreshCw className="w-3 h-3 mr-1" />retried
                          </Badge>
                        )}
                        {agent.validated && (
                          <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-mono">
                            <CheckCircle2 className="w-3 h-3 mr-1" />schema ✓
                          </Badge>
                        )}
                        {agent.status === "running" && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
                        {agent.status === "completed" && !agent.validated && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                        {agent.status === "error" && <AlertCircle className="w-4 h-4 text-destructive" />}
                        <span className="text-xs uppercase tracking-wider text-muted-foreground font-mono">{agent.status}</span>
                      </div>
                    </div>
                    {agent.retried && agent.validationError && (
                      <div className="bg-amber-500/5 border-b border-amber-500/20 px-4 py-2 flex items-start gap-2">
                        <RefreshCw className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <span className="text-xs text-amber-400 font-mono">Validation failed — retrying with correction: {agent.validationError.slice(0, 120)}{agent.validationError.length > 120 ? "…" : ""}</span>
                      </div>
                    )}
                    {agent.output && (
                      <div className="bg-[#0a0a0a] p-4 text-xs font-mono text-gray-300 whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                        {agent.output}
                        {agent.status === "running" && <span className="inline-block w-2 h-3 ml-1 bg-primary animate-pulse" />}
                        <div ref={el => { outputEndRefs.current[agent.name] = el; }} />
                      </div>
                    )}
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
            {pipelineError && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Card className="border-destructive/50 bg-destructive/10">
                  <CardContent className="p-4 space-y-2">
                    {(() => {
                      try {
                        const parsed = JSON.parse(pipelineError) as { agent: string; reason: string; rawOutput?: string };
                        return (
                          <>
                            <div className="flex items-center gap-2">
                              <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
                              <span className="font-semibold text-sm text-destructive-foreground">Agent Validation Failed: {parsed.agent}</span>
                            </div>
                            <p className="text-xs font-mono text-destructive-foreground/80 ml-7">{parsed.reason}</p>
                            {parsed.rawOutput && (
                              <div className="ml-7 bg-black/30 rounded p-2 text-xs font-mono text-gray-400 max-h-24 overflow-y-auto whitespace-pre-wrap">
                                {parsed.rawOutput}
                              </div>
                            )}
                          </>
                        );
                      } catch {
                        return (
                          <div className="flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                            <div className="text-sm font-mono text-destructive-foreground whitespace-pre-wrap">{pipelineError}</div>
                          </div>
                        );
                      }
                    })()}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>
        </div>
      )}

      {/* Final Results */}
      {hasResults && !isRunning && (
        <div className="space-y-4 animate-in slide-in-from-bottom-8 duration-700">
          <h2 className="text-lg font-bold flex items-center gap-2 mt-8">
            <FileText className="w-5 h-5 text-primary" />
            Analysis Results
          </h2>

          <Tabs defaultValue="steps" className="w-full">
            <TabsList className="w-full grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 bg-card border border-border/50 h-auto p-1 gap-1">
              <TabsTrigger value="steps" className="font-mono text-xs py-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">Repro</TabsTrigger>
              <TabsTrigger value="test" className="font-mono text-xs py-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">Test Code</TabsTrigger>
              <TabsTrigger value="hypotheses" className="font-mono text-xs py-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">Hypotheses</TabsTrigger>
              <TabsTrigger value="diagram" className="font-mono text-xs py-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">Flow</TabsTrigger>
              <TabsTrigger value="questions" className="font-mono text-xs py-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">Questions</TabsTrigger>
              <TabsTrigger value="audit" onClick={() => {}} className="font-mono text-xs py-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">Audit Trail</TabsTrigger>
              <TabsTrigger value="correlations" onClick={fetchCorrelations} className="font-mono text-xs py-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">Similar Bugs</TabsTrigger>
              <TabsTrigger value="collaborate" onClick={() => { loadAnnotations(); connectCollaboration(); }} className="font-mono text-xs py-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                <Users className="w-3 h-3 mr-1" />Team
              </TabsTrigger>
            </TabsList>

            <div className="mt-4">
              <TabsContent value="steps" className="m-0">
                <Card className="border-border/50 bg-card shadow-sm">
                  <CardContent className="p-0">
                    {analysis.reproductionSteps
                      ? <StructuredReproSteps raw={analysis.reproductionSteps} />
                      : <div className="p-6 text-sm text-muted-foreground text-center">No reproduction steps generated.</div>}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="test" className="m-0">
                <Card className="border-border/50 bg-card shadow-sm">
                  <CardContent className="p-0">
                    <div className="bg-[#0a0a0a] rounded-lg p-6 font-mono text-sm whitespace-pre-wrap text-blue-300">
                      {analysis.testCode || "// No test code generated."}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="hypotheses" className="m-0">
                <Card className="border-border/50 bg-card shadow-sm">
                  <CardContent className="p-6">
                    {analysis.hypotheses
                      ? <StructuredHypotheses raw={analysis.hypotheses} />
                      : <p className="text-sm text-muted-foreground text-center py-8">No hypotheses generated.</p>}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="diagram" className="m-0">
                <Card className="border-border/50 bg-card shadow-sm">
                  <CardContent className="p-6">
                    {analysis.flowDiagram ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <GitMerge className="w-4 h-4 text-primary" />
                          <span>Copy the Mermaid source below into <a href="https://mermaid.live" target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/80">mermaid.live</a> or any Mermaid renderer to view the diagram.</span>
                        </div>
                        <div className="bg-[#0a0a0a] rounded border border-border/50 p-5 font-mono text-sm whitespace-pre-wrap text-cyan-300 overflow-x-auto">
                          {analysis.flowDiagram}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-muted/30 rounded border border-border/50 p-6 flex flex-col items-center justify-center min-h-[300px]">
                        <GitMerge className="w-8 h-8 text-primary/50 mb-4" />
                        <p className="text-sm text-muted-foreground">Flow diagram not available. Run the pipeline to generate one.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="questions" className="m-0">
                <Card className="border-border/50 bg-card shadow-sm">
                  <CardContent className="p-6">
                    {analysis.clarifyingQuestions ? (
                      <div className="space-y-3">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Targeted Clarifying Questions</p>
                        <StructuredQuestions raw={analysis.clarifyingQuestions} />
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-8">No clarifying questions needed.</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Feature 8: Audit Trail */}
              <TabsContent value="audit" className="m-0">
                <Card className="border-border/50 bg-card shadow-sm">
                  <CardHeader className="pb-3 border-b border-border/50">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Clock className="w-4 h-4 text-primary" />
                      Reproduction Audit Trail
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">Every decision the pipeline made — fully auditable</p>
                  </CardHeader>
                  <CardContent className="p-4">
                    {auditTrail.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">No audit trail available. Run the pipeline to generate one.</p>
                    ) : (
                      <div className="relative pl-4">
                        <div className="absolute left-0 top-0 bottom-0 w-px bg-border" />
                        <div className="space-y-6">
                          {auditTrail.map((entry, i) => (
                            <div key={i} className="relative">
                              <div className="absolute -left-[1.35rem] top-1 w-3 h-3 rounded-full bg-primary/30 border-2 border-primary" />
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-sm font-mono text-primary">{entry.agent}</span>
                                  <Badge variant="outline" className="text-xs">{entry.action.replace(/_/g, " ")}</Badge>
                                  <span className="text-xs text-muted-foreground ml-auto">
                                    {format(new Date(entry.timestamp), "HH:mm:ss")}
                                  </span>
                                </div>
                                <p className="text-sm font-medium">{entry.decision}</p>
                                <p className="text-xs text-muted-foreground">{entry.rationale}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Feature 2: Multi-Bug Correlation */}
              <TabsContent value="correlations" className="m-0">
                <Card className="border-border/50 bg-card shadow-sm">
                  <CardHeader className="pb-3 border-b border-border/50 flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Network className="w-4 h-4 text-primary" />
                        Similar Past Bugs
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">Structurally similar bugs from your history</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => { setCorrelationsFetched(false); fetchCorrelations(); }} disabled={correlationsLoading}>
                      <RefreshCw className={`w-4 h-4 ${correlationsLoading ? "animate-spin" : ""}`} />
                    </Button>
                  </CardHeader>
                  <CardContent className="p-4">
                    {correlationsLoading ? (
                      <div className="py-8 text-center text-muted-foreground">
                        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                        <p className="text-sm">Searching for similar bugs...</p>
                      </div>
                    ) : correlations.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        {correlationsFetched ? "No similar bugs found in history." : "Click the tab to search for similar bugs."}
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {correlations.map((c) => (
                          <div key={c.id} className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <Link href={`/analyses/${c.id}`}>
                                <span className="font-medium text-sm hover:text-primary transition-colors cursor-pointer">{c.title}</span>
                              </Link>
                              <Badge className={`text-xs shrink-0 ${c.similarity >= 70 ? "bg-red-500/20 text-red-400 border-red-500/30" : c.similarity >= 50 ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : "bg-blue-500/20 text-blue-400 border-blue-500/30"}`} variant="outline">
                                {c.similarity}% similar
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">{c.rootCauseNote}</p>
                            <div className="flex flex-wrap gap-1.5">
                              {c.commonFactors.map((f, fi) => (
                                <Badge key={fi} variant="secondary" className="text-xs">{f}</Badge>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Feature 4: Collaboration */}
              <TabsContent value="collaborate" className="m-0">
                <Card className="border-border/50 bg-card shadow-sm">
                  <CardHeader className="pb-3 border-b border-border/50">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <Users className="w-4 h-4 text-primary" />
                          Reproduction Session
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">Annotate steps, mark verifications, ask questions</p>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                        {collaboratorCount} online
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                    {/* Existing annotations */}
                    {annotations.length > 0 && (
                      <div className="space-y-3 max-h-64 overflow-y-auto">
                        {annotations.map((a) => {
                          const cfg = ANNOTATION_CONFIG[a.type];
                          const Icon = cfg.icon;
                          return (
                            <div key={a.id} className="flex gap-3 text-sm">
                              <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${cfg.color}`} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-xs">{a.authorName}</span>
                                  <Badge variant="outline" className="text-xs">{cfg.label}</Badge>
                                  {a.stepRef && <span className="text-xs text-muted-foreground">re: {a.stepRef}</span>}
                                  <span className="text-xs text-muted-foreground ml-auto">{format(new Date(a.createdAt), "HH:mm")}</span>
                                </div>
                                <p className="text-sm text-muted-foreground mt-0.5">{a.content}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {annotations.length === 0 && (
                      <div className="text-center py-6 text-muted-foreground text-sm">
                        <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-20" />
                        No annotations yet. Be the first to add one.
                      </div>
                    )}

                    {/* Add annotation */}
                    <div className="border-t border-border/50 pt-4 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Your name</p>
                          <Input value={authorName} onChange={e => setAuthorName(e.target.value)} placeholder="Anonymous" className="text-sm h-8" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Type</p>
                          <Select value={annotationType} onValueChange={v => setAnnotationType(v as typeof annotationType)}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="note">Note</SelectItem>
                              <SelectItem value="verified">Verified</SelectItem>
                              <SelectItem value="failed">Failed</SelectItem>
                              <SelectItem value="question">Question</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Step reference (optional)</p>
                        <Input value={annotationStepRef} onChange={e => setAnnotationStepRef(e.target.value)} placeholder="e.g. Step 3" className="text-sm h-8" />
                      </div>
                      <div>
                        <Textarea
                          value={annotationContent}
                          onChange={e => setAnnotationContent(e.target.value)}
                          placeholder="Add your annotation..."
                          rows={3}
                          className="text-sm resize-none"
                        />
                      </div>
                      <Button onClick={submitAnnotation} disabled={submittingAnnotation || !annotationContent.trim()} size="sm" className="w-full gap-2">
                        <Send className="w-3.5 h-3.5" />
                        {submittingAnnotation ? "Posting..." : "Post Annotation"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      )}
    </div>
  );
}
