import { Link } from "wouter";
import { BugPlay, FileText, CheckCircle, Database, GitMerge, ArrowRight, Server, MessageSquare, Terminal, RefreshCw, AlertTriangle, MonitorPlay } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground animate-in fade-in duration-700">
      {/* Hero Section */}
      <section className="px-4 py-24 md:py-32 max-w-6xl mx-auto flex flex-col items-center text-center space-y-8">
        <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-primary/30 bg-primary/10 text-primary">
          BugRepro Engine v1.0
        </div>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight max-w-4xl text-balance">
          Transform Bug Reports Into <span className="text-primary">Actionable Workflows</span>
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl text-balance">
          A multi-agent AI pipeline that ingests plain text, stack traces, and GitHub issues to generate ranked hypotheses, precise reproduction steps, and executable test code.
        </p>
        <div className="pt-4 flex items-center gap-4">
          <Link href="/dashboard">
            <Button size="lg" className="font-mono text-base px-8 h-12" data-testid="open-dashboard-btn">
              Open Dashboard
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border bg-card/30">
        <div className="px-4 py-20 max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
          <Card className="bg-background/50 border-border/50">
            <CardHeader>
              <Database className="w-8 h-8 text-primary mb-2" />
              <CardTitle>Multi-Agent AI Pipeline</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              Powered by five specialized agents working in sequence to extract context, generate hypotheses, and synthesize actionable reproduction steps.
            </CardContent>
          </Card>
          <Card className="bg-background/50 border-border/50">
            <CardHeader>
              <FileText className="w-8 h-8 text-primary mb-2" />
              <CardTitle>8 Source Types</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              Ingest bugs from GitHub, Jira, Sentry, log files, stack traces, cURL requests, video descriptions, or raw text.
            </CardContent>
          </Card>
          <Card className="bg-background/50 border-border/50">
            <CardHeader>
              <BugPlay className="w-8 h-8 text-primary mb-2" />
              <CardTitle>Executable Test Code</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              Automatically generates code snippets to reproduce the failure reliably in your testing environment.
            </CardContent>
          </Card>
        </div>
      </section>

      {/* How it works */}
      <section className="px-4 py-24 max-w-5xl mx-auto space-y-16">
        <div className="text-center space-y-4">
          <h2 className="text-3xl font-bold tracking-tight">How It Works</h2>
          <p className="text-muted-foreground">The five-stage pipeline transforms messy reports into structured tests.</p>
        </div>

        <div className="relative border-l border-primary/20 pl-8 ml-4 md:ml-8 space-y-12">
          {[
            {
              title: "Entity Extraction",
              desc: "Identifies components, actions, failures, and environment details from the raw input.",
            },
            {
              title: "Hypothesis Generator",
              desc: "Creates ranked root cause theories based on extracted entities and context.",
            },
            {
              title: "Step Validator",
              desc: "Produces precise, numbered reproduction steps that map to user actions.",
            },
            {
              title: "Test Writer",
              desc: "Generates executable test code (e.g., Playwright, Jest) to reliably reproduce the bug.",
            },
            {
              title: "Analysis Synthesizer",
              desc: "Combines all outputs, adds confidence scores, and produces Mermaid flow diagrams.",
            }
          ].map((step, i) => (
            <div key={i} className="relative">
              <div className="absolute -left-[45px] top-1 flex h-7 w-7 items-center justify-center rounded-full border border-primary/30 bg-background text-sm font-mono text-primary font-bold">
                {i + 1}
              </div>
              <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
              <p className="text-muted-foreground">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Source Types */}
      <section className="border-t border-border bg-card/50">
        <div className="px-4 py-24 max-w-6xl mx-auto space-y-12">
          <div className="text-center space-y-4">
            <h2 className="text-3xl font-bold tracking-tight">Supported Source Types</h2>
            <p className="text-muted-foreground">Paste bugs from wherever they happen.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: FileText, label: "Raw Text", desc: "Plain English descriptions" },
              { icon: GitMerge, label: "GitHub Issue", desc: "Auto-fetch via URL" },
              { icon: Terminal, label: "Stack Trace", desc: "Error logs and call chains" },
              { icon: CheckCircle, label: "Jira Ticket", desc: "Issue descriptions" },
              { icon: AlertTriangle, label: "Sentry Event", desc: "Crash reports and breadcrumbs" },
              { icon: Server, label: "Log File", desc: "Server and app logs" },
              { icon: RefreshCw, label: "cURL Request", desc: "Failed API calls" },
              { icon: MonitorPlay, label: "Video / Recording", desc: "Screen recording transcriptions" },
            ].map((source, i) => (
              <div key={i} className="flex flex-col p-4 rounded-lg border border-border/50 bg-background/50 hover:border-primary/50 transition-colors">
                <source.icon className="w-6 h-6 text-primary mb-3" />
                <div className="font-semibold text-sm mb-1">{source.label}</div>
                <div className="text-xs text-muted-foreground">{source.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
