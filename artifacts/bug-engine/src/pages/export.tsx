import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useGetAnalysis, useExportAnalysis, getGetAnalysisQueryKey } from "@workspace/api-client-react";
import {
  ArrowLeft, Download, Copy, Printer, CheckCircle, ChevronDown, ChevronUp,
  AlertCircle, CheckCircle2, HelpCircle, Code2, Lightbulb, Tags, Github,
  FileText, ClipboardList, Cpu, ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

// ─── JSON field parsers ───────────────────────────────────────────────────────

function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

type EntityData = {
  component?: string;
  triggerAction?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  environment?: Record<string, string>;
  errorMessages?: string[];
  frequency?: string;
  additionalContext?: string;
};

type HypothesisItem = {
  id?: string;
  title?: string;
  mechanism?: string;
  likelihood?: string;
  status?: string;
  statusReason?: string;
  confirmingEvidence?: string[];
  refutingEvidence?: string[];
};

type ReproStep = { number?: number; action?: string; expectedOutcome?: string };
type ReproData = {
  prerequisites?: string[];
  steps?: ReproStep[];
  expectedResult?: string;
  actualResult?: string;
  environmentConfig?: string[];
  validationNotes?: string[];
  confidenceRating?: number;
};

type FixSuggestion = {
  rank?: number;
  title?: string;
  description?: string;
  codeLocation?: string;
  effort?: string;
  confidence?: string;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className="w-5 h-5 text-primary shrink-0" />
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
    </div>
  );
}

function SeverityBadge({ severity }: { severity?: string | null }) {
  if (!severity) return null;
  const colors: Record<string, string> = {
    critical: "bg-red-500/20 text-red-400 border-red-500/30",
    high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    low: "bg-green-500/20 text-green-400 border-green-500/30",
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase border ${colors[severity] ?? "bg-muted text-muted-foreground"}`}>
      {severity}
    </span>
  );
}

function EntitySection({ raw }: { raw?: string | null }) {
  const data = safeJson<EntityData>(raw, {});
  if (!data || Object.keys(data).length === 0) return <p className="text-muted-foreground text-sm italic">Not yet analysed</p>;

  const rows = [
    { label: "Component", value: data.component },
    { label: "Trigger Action", value: data.triggerAction },
    { label: "Expected", value: data.expectedBehavior },
    { label: "Actual (Bug)", value: data.actualBehavior },
    { label: "Frequency", value: data.frequency },
    { label: "Additional Context", value: data.additionalContext },
  ].filter(r => r.value);

  const envEntries = Object.entries(data.environment ?? {}).filter(([, v]) => v);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {rows.map(row => (
          <div key={row.label} className="bg-muted/30 rounded-lg p-3 border border-border/40">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-1">{row.label}</div>
            <div className="text-sm">{row.value}</div>
          </div>
        ))}
      </div>
      {envEntries.length > 0 && (
        <div className="bg-muted/30 rounded-lg p-3 border border-border/40">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-2">Environment</div>
          <div className="flex flex-wrap gap-2">
            {envEntries.map(([k, v]) => (
              <span key={k} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded font-mono">
                {k}: {v}
              </span>
            ))}
          </div>
        </div>
      )}
      {data.errorMessages && data.errorMessages.length > 0 && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-widest text-red-400 font-medium mb-2">Error Messages</div>
          {data.errorMessages.map((msg, i) => (
            <pre key={i} className="text-xs text-red-300 font-mono whitespace-pre-wrap break-words">{msg}</pre>
          ))}
        </div>
      )}
    </div>
  );
}

function HypothesesSection({ raw }: { raw?: string | null }) {
  const items = safeJson<HypothesisItem[]>(raw, []);
  if (!items || items.length === 0) return <p className="text-muted-foreground text-sm italic">Not yet analysed</p>;

  return (
    <div className="space-y-3">
      {items.map((h, i) => {
        const isRetained = h.status === "retained";
        return (
          <div key={i} className={`rounded-lg p-4 border ${isRetained ? "bg-emerald-500/5 border-emerald-500/20" : "bg-muted/20 border-border/30 opacity-75"}`}>
            <div className="flex items-start justify-between gap-3 mb-2">
              <span className="font-semibold text-sm">{h.title}</span>
              <div className="flex items-center gap-2 shrink-0">
                {h.likelihood && (
                  <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${h.likelihood === "high" ? "text-orange-400 bg-orange-500/10" : h.likelihood === "medium" ? "text-yellow-400 bg-yellow-500/10" : "text-blue-400 bg-blue-500/10"}`}>
                    {h.likelihood}
                  </span>
                )}
                {isRetained
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  : <AlertCircle className="w-4 h-4 text-muted-foreground" />}
                <span className={`text-xs font-medium ${isRetained ? "text-emerald-400" : "text-muted-foreground"}`}>
                  {h.status?.toUpperCase()}
                </span>
              </div>
            </div>
            {h.mechanism && <p className="text-xs text-muted-foreground mb-2">{h.mechanism}</p>}
            {h.statusReason && <p className="text-xs italic text-muted-foreground/80">{h.statusReason}</p>}
          </div>
        );
      })}
    </div>
  );
}

function ReproStepsSection({ raw }: { raw?: string | null }) {
  const data = safeJson<ReproData>(raw, {});
  if (!data || Object.keys(data).length === 0) return <p className="text-muted-foreground text-sm italic">Not yet analysed</p>;

  return (
    <div className="space-y-4">
      {data.prerequisites && data.prerequisites.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground font-medium mb-2">Prerequisites</div>
          <ul className="space-y-1">
            {data.prerequisites.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="text-muted-foreground shrink-0 mt-0.5">•</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.steps && data.steps.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground font-medium mb-3">Steps to Reproduce</div>
          <ol className="space-y-2">
            {data.steps.map((s, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                  {s.number ?? i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{s.action}</p>
                  {s.expectedOutcome && <p className="text-xs text-muted-foreground mt-0.5">→ {s.expectedOutcome}</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
      {(data.expectedResult || data.actualResult) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
          {data.expectedResult && (
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
              <div className="text-[10px] uppercase text-emerald-400 font-medium mb-1">Expected</div>
              <p className="text-sm">{data.expectedResult}</p>
            </div>
          )}
          {data.actualResult && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
              <div className="text-[10px] uppercase text-red-400 font-medium mb-1">Actual (Bug)</div>
              <p className="text-sm">{data.actualResult}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FixSuggestionsSection({ raw }: { raw?: string | null }) {
  const suggestions = safeJson<FixSuggestion[]>(raw, []);
  if (!suggestions || suggestions.length === 0) return null;

  const effortColor: Record<string, string> = {
    low: "text-emerald-400 bg-emerald-500/10",
    medium: "text-yellow-400 bg-yellow-500/10",
    high: "text-red-400 bg-red-500/10",
  };
  const confColor: Record<string, string> = {
    high: "text-emerald-400",
    medium: "text-yellow-400",
    low: "text-muted-foreground",
  };

  return (
    <div className="space-y-3">
      {suggestions.map((s, i) => (
        <div key={i} className="bg-muted/30 border border-border/40 rounded-lg p-4">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                {s.rank ?? i + 1}
              </span>
              <span className="font-semibold text-sm">{s.title}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {s.effort && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${effortColor[s.effort] ?? "text-muted-foreground"}`}>
                  {s.effort}
                </span>
              )}
            </div>
          </div>
          {s.description && <p className="text-sm text-muted-foreground mb-2">{s.description}</p>}
          {s.codeLocation && (
            <div className="flex items-center gap-1.5">
              <Code2 className="w-3 h-3 text-muted-foreground" />
              <code className="text-xs text-primary/80 font-mono">{s.codeLocation}</code>
              {s.confidence && (
                <span className={`text-xs ml-1 ${confColor[s.confidence] ?? ""}`}>
                  · {s.confidence} confidence
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Export Format Generators ─────────────────────────────────────────────────

function buildGithubIssue(analysis: {
  title: string;
  inputType: string;
  severity?: string | null;
  confidenceScore?: number | null;
  extractedEntities?: string | null;
  reproductionSteps?: string | null;
  testCode?: string | null;
  clarifyingQuestions?: string | null;
  createdAt: string;
}): string {
  const entities = safeJson<EntityData>(analysis.extractedEntities, {});
  const repro = safeJson<ReproData>(analysis.reproductionSteps, {});
  const questions = safeJson<string[]>(analysis.clarifyingQuestions, []);

  const prereqs = repro.prerequisites?.map(p => `- ${p}`).join("\n") ?? "";
  const steps = repro.steps?.map(s => `${s.number ?? "?"}. ${s.action}`).join("\n") ?? "";

  return `## Bug Report: ${analysis.title}

**Severity:** ${(analysis.severity ?? "unknown").toUpperCase()}
**Confidence:** ${analysis.confidenceScore != null ? `${Math.round(analysis.confidenceScore * 100)}%` : "N/A"}
**Source:** ${analysis.inputType.replace(/_/g, " ")}

---

## Summary

${entities.actualBehavior ?? "_Not available_"}

**Expected behavior:** ${entities.expectedBehavior ?? "_Not available_"}

**Component:** \`${entities.component ?? "Unknown"}\`

---

## Steps to Reproduce

${prereqs ? `### Prerequisites\n${prereqs}\n\n` : ""}${steps || "_Steps not available_"}

---

## Test Case

\`\`\`typescript
${analysis.testCode ?? "// Not yet generated"}
\`\`\`

---

## Clarifying Questions

${questions.map((q, i) => `${i + 1}. ${q}`).join("\n") || "_None_"}

---

*Generated by BugRepro_Engine on ${format(new Date(analysis.createdAt), "PPP")}*`;
}

function buildJiraTicket(analysis: {
  title: string;
  inputType: string;
  severity?: string | null;
  confidenceScore?: number | null;
  extractedEntities?: string | null;
  reproductionSteps?: string | null;
  hypotheses?: string | null;
}): string {
  const entities = safeJson<EntityData>(analysis.extractedEntities, {});
  const repro = safeJson<ReproData>(analysis.reproductionSteps, {});
  const hyps = safeJson<HypothesisItem[]>(analysis.hypotheses, []);
  const retained = hyps.filter(h => h.status === "retained");

  const steps = repro.steps?.map(s => `# ${s.action}`).join("\n") ?? "";

  return `h1. ${analysis.title}

*Priority:* ${analysis.severity === "critical" ? "Highest" : analysis.severity === "high" ? "High" : analysis.severity === "medium" ? "Medium" : "Low"}
*Component:* ${entities.component ?? "Unknown"}
*Frequency:* ${entities.frequency ?? "Unknown"}

h2. Problem Description

${entities.actualBehavior ?? "_Not available_"}

*Expected:* ${entities.expectedBehavior ?? "_Not available_"}

h2. Environment

${Object.entries(entities.environment ?? {}).filter(([, v]) => v).map(([k, v]) => `* ${k}: ${v}`).join("\n") || "* Not specified"}

h2. Steps to Reproduce

${steps || "# Not available"}

h2. Root Cause Hypothesis

${retained.map(h => `* *${h.title}*: ${h.mechanism ?? ""}`).join("\n") || "* Under investigation"}

h2. Acceptance Criteria

* [ ] Bug reproduced in target environment
* [ ] Root cause confirmed
* [ ] Fix applied and verified
* [ ] Regression test added

_Confidence: ${analysis.confidenceScore != null ? `${Math.round(analysis.confidenceScore * 100)}%` : "N/A"} — Generated by BugRepro_Engine_`;
}

// ─── Main Export Page ─────────────────────────────────────────────────────────

export function ExportPage() {
  const [, params] = useRoute("/analyses/:id/export");
  const id = params?.id ? parseInt(params.id, 10) : 0;
  const { toast } = useToast();

  const { data: analysis, isLoading } = useGetAnalysis(id, {
    query: { enabled: !!id, queryKey: getGetAnalysisQueryKey(id) }
  });

  const { data: exportData } = useExportAnalysis(id, {
    query: { enabled: !!id && analysis?.status === "completed", queryKey: ["export", id] }
  });

  const [copied, setCopied] = useState(false);
  const [expandedRaw, setExpandedRaw] = useState(false);

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!analysis) {
    return <div className="text-center py-16 text-muted-foreground">Analysis not found</div>;
  }

  if (analysis.status !== "completed") {
    return (
      <div className="max-w-4xl mx-auto text-center py-16 space-y-4">
        <FileText className="w-12 h-12 mx-auto text-muted-foreground/30" />
        <h2 className="text-2xl font-bold">Analysis not complete</h2>
        <p className="text-muted-foreground">Run the pipeline first to generate a report.</p>
        <Link href={`/analyses/${id}`}>
          <Button variant="outline">Back to Analysis</Button>
        </Link>
      </div>
    );
  }

  const handleCopy = (text: string, label = "Copied!") => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: label, description: "Copied to clipboard." });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = (content: string, filename: string, type = "text/markdown") => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const githubIssue = buildGithubIssue({
    title: analysis.title,
    inputType: analysis.inputType,
    severity: analysis.severity,
    confidenceScore: analysis.confidenceScore,
    extractedEntities: analysis.extractedEntities,
    reproductionSteps: analysis.reproductionSteps,
    testCode: analysis.testCode,
    clarifyingQuestions: analysis.clarifyingQuestions,
    createdAt: analysis.createdAt,
  });

  const jiraTicket = buildJiraTicket({
    title: analysis.title,
    inputType: analysis.inputType,
    severity: analysis.severity,
    confidenceScore: analysis.confidenceScore,
    extractedEntities: analysis.extractedEntities,
    reproductionSteps: analysis.reproductionSteps,
    hypotheses: analysis.hypotheses,
  });

  const questions = safeJson<string[]>(analysis.clarifyingQuestions, []);
  const autoTags = safeJson<string[]>((analysis as Record<string, unknown>).autoTags as string, []);

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between no-print flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href={`/analyses/${id}`}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">Export Report</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => handleCopy(exportData?.markdown ?? "", "Markdown copied!")}>
            {copied ? <CheckCircle className="w-3.5 h-3.5 mr-1.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
            Copy MD
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleDownload(exportData?.markdown ?? "", `${analysis.title.replace(/\s+/g, "_")}_report.md`)}>
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Download .md
          </Button>
          <Button variant="outline" size="sm" onClick={() => { handleCopy(githubIssue, "GitHub issue copied!"); }}>
            <Github className="w-3.5 h-3.5 mr-1.5" />
            GitHub Issue
          </Button>
          <Button variant="outline" size="sm" onClick={() => { handleCopy(jiraTicket, "Jira ticket copied!"); }}>
            <ClipboardList className="w-3.5 h-3.5 mr-1.5" />
            Jira Format
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="w-3.5 h-3.5 mr-1.5" />
            Print
          </Button>
        </div>
      </div>

      {/* Report Card */}
      <div className="bg-card border border-border/50 rounded-xl overflow-hidden print:border-none">
        {/* Report Header */}
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-8 py-6 border-b border-border/50">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold mb-2">{analysis.title}</h1>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="capitalize">{analysis.inputType.replace(/_/g, " ")}</span>
                <span>·</span>
                <span>{format(new Date(analysis.createdAt), "PPP")}</span>
                {analysis.confidenceScore != null && (
                  <>
                    <span>·</span>
                    <span className="text-primary font-medium">{Math.round(analysis.confidenceScore * 100)}% confidence</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <SeverityBadge severity={analysis.severity} />
            </div>
          </div>
          {autoTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {autoTags.map((tag: string) => (
                <Badge key={tag} variant="secondary" className="text-[10px] font-mono">{tag}</Badge>
              ))}
            </div>
          )}
        </div>

        <div className="p-8 space-y-8">
          {/* 1. Extracted Entities */}
          <section>
            <SectionHeader icon={Cpu} title="1. Extracted Entities" />
            <EntitySection raw={analysis.extractedEntities} />
          </section>

          <div className="border-t border-border/30" />

          {/* 2. Hypotheses */}
          <section>
            <SectionHeader icon={Lightbulb} title="2. Root Cause Hypotheses" />
            <HypothesesSection raw={analysis.hypotheses} />
          </section>

          <div className="border-t border-border/30" />

          {/* 3. Reproduction Steps */}
          <section>
            <SectionHeader icon={ClipboardList} title="3. Reproduction Steps" />
            <ReproStepsSection raw={analysis.reproductionSteps} />
          </section>

          <div className="border-t border-border/30" />

          {/* 4. Test Code */}
          <section>
            <SectionHeader icon={Code2} title="4. Generated Test Code" />
            {analysis.testCode ? (
              <div className="relative">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground font-mono">
                    {analysis.testSyntaxStatus === "verified" && <span className="text-emerald-400">✓ Syntax verified</span>}
                    {analysis.testSyntaxStatus === "warning" && <span className="text-yellow-400">⚠ Review before running</span>}
                  </span>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => handleCopy(analysis.testCode!, "Test code copied!")}>
                    <Copy className="w-3 h-3 mr-1" />Copy
                  </Button>
                </div>
                <pre className="bg-black/40 border border-border/40 rounded-lg p-4 text-xs font-mono overflow-x-auto text-green-300 whitespace-pre leading-relaxed max-h-[480px] overflow-y-auto">
                  {analysis.testCode}
                </pre>
              </div>
            ) : <p className="text-muted-foreground text-sm italic">Not yet generated</p>}
          </section>

          {/* 5. Fix Suggestions */}
          {(analysis as Record<string, unknown>).fixSuggestions && (
            <>
              <div className="border-t border-border/30" />
              <section>
                <SectionHeader icon={Lightbulb} title="5. AI Fix Suggestions" />
                <FixSuggestionsSection raw={(analysis as Record<string, unknown>).fixSuggestions as string} />
              </section>
            </>
          )}

          <div className="border-t border-border/30" />

          {/* 6. Clarifying Questions */}
          {questions.length > 0 && (
            <section>
              <SectionHeader icon={HelpCircle} title="6. Clarifying Questions" />
              <ol className="space-y-2">
                {questions.map((q: string, i: number) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-yellow-500/20 text-yellow-400 text-xs font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    <p className="text-sm text-muted-foreground">{q}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* Raw Input (collapsible) */}
          <div className="border-t border-border/30" />
          <section>
            <button
              onClick={() => setExpandedRaw(v => !v)}
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
            >
              <FileText className="w-4 h-4" />
              Original Bug Report
              {expandedRaw ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
            </button>
            {expandedRaw && (
              <pre className="mt-3 bg-muted/30 border border-border/40 rounded-lg p-4 text-xs font-mono whitespace-pre-wrap text-muted-foreground max-h-48 overflow-y-auto">
                {analysis.rawInput}
              </pre>
            )}
          </section>

          {/* Footer */}
          <div className="text-xs text-muted-foreground/50 text-center pt-2">
            Generated by BugRepro_Engine · {format(new Date(), "PPP p")}
          </div>
        </div>
      </div>
    </div>
  );
}
