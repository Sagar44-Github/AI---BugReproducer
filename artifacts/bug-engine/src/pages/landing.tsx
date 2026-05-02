import { Link } from "wouter";
import { useRef } from "react";
import {
  BugPlay, FileText, CheckCircle, Database, GitMerge, ArrowRight,
  Server, MessageSquare, Terminal, RefreshCw, AlertTriangle, MonitorPlay, Zap, Shield, GitBranch
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, useScroll, useTransform } from "framer-motion";
import { TiltCard } from "@/components/tilt-card";
import { ScrollReveal, StaggerContainer, StaggerItem } from "@/components/scroll-reveal";

const AGENTS = [
  { num: "01", title: "Entity Extraction", desc: "Identifies components, actions, failures, and environment details from the raw input.", color: "from-cyan-500/20 to-transparent" },
  { num: "02", title: "Hypothesis Generator", desc: "Creates ranked root cause theories based on extracted entities and context.", color: "from-blue-500/20 to-transparent" },
  { num: "03", title: "Step Validator", desc: "Produces precise, numbered reproduction steps that map to user actions.", color: "from-violet-500/20 to-transparent" },
  { num: "04", title: "Test Writer", desc: "Generates executable test code (e.g., Playwright, Jest) to reliably reproduce the bug.", color: "from-emerald-500/20 to-transparent" },
  { num: "05", title: "Analysis Synthesizer", desc: "Combines all outputs, adds confidence scores, and produces Mermaid flow diagrams.", color: "from-amber-500/20 to-transparent" },
];

const SOURCE_TYPES = [
  { icon: FileText, label: "Raw Text", desc: "Plain English descriptions" },
  { icon: GitMerge, label: "GitHub Issue", desc: "Auto-fetch via URL" },
  { icon: Terminal, label: "Stack Trace", desc: "Error logs and call chains" },
  { icon: CheckCircle, label: "Jira Ticket", desc: "Issue descriptions" },
  { icon: AlertTriangle, label: "Sentry Event", desc: "Crash reports and breadcrumbs" },
  { icon: Server, label: "Log File", desc: "Server and app logs" },
  { icon: RefreshCw, label: "cURL Request", desc: "Failed API calls" },
  { icon: MonitorPlay, label: "Video / Recording", desc: "Screen recording transcriptions" },
];

const FEATURES = [
  { icon: Database, title: "Multi-Agent Pipeline", desc: "Five specialized agents working in sequence to extract context, generate hypotheses, and synthesize actionable reproduction steps." },
  { icon: Zap, title: "8 Source Types", desc: "Ingest bugs from GitHub, Jira, Sentry, log files, stack traces, cURL requests, video descriptions, or raw text." },
  { icon: BugPlay, title: "Executable Test Code", desc: "Automatically generates code snippets to reproduce the failure reliably in your testing environment." },
  { icon: Shield, title: "Confidence Scoring", desc: "Every analysis comes with a breakdown of evidence, assumptions, and missing context — so you know how much to trust each result." },
  { icon: GitBranch, title: "Correlation Engine", desc: "Automatically surfaces similar bugs across your history using semantic similarity, saving time on recurring issues." },
  { icon: MessageSquare, title: "Collaboration Layer", desc: "Annotate, verify, and question any finding as a team — building shared understanding around every bug." },
];

function FloatingOrb({ className }: { className?: string }) {
  return (
    <div className={`absolute rounded-full blur-[120px] pointer-events-none ${className}`} />
  );
}

function GridBackground() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(6,182,212,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(6,182,212,0.04)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_80%)]" />
    </div>
  );
}

export function LandingPage() {
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroY = useTransform(scrollYProgress, [0, 1], ["0%", "28%"]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground overflow-x-hidden">

      {/* ─── Hero ─────────────────────────────────────────────── */}
      <section ref={heroRef} className="relative px-4 pt-28 pb-32 md:pt-36 md:pb-44 overflow-hidden">
        <GridBackground />

        {/* Glowing orbs */}
        <FloatingOrb className="w-[500px] h-[500px] bg-cyan-500/15 top-[-120px] left-[10%] animate-orb-drift" />
        <FloatingOrb className="w-[400px] h-[400px] bg-blue-600/12 top-[60px] right-[-80px] animate-orb-drift-slow" />
        <FloatingOrb className="w-[300px] h-[300px] bg-violet-500/10 bottom-[-60px] left-[40%] animate-orb-float" />

        <motion.div
          style={{ y: heroY, opacity: heroOpacity }}
          className="relative max-w-6xl mx-auto flex flex-col items-center text-center space-y-8"
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1 text-xs font-semibold text-primary"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            BugRepro Engine v1.0 — Live
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="text-5xl md:text-7xl font-bold tracking-tight max-w-4xl text-balance leading-[1.07]"
          >
            Transform Bug Reports Into{" "}
            <span className="relative inline-block">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 animate-gradient-x">
                Actionable Workflows
              </span>
              <motion.span
                className="absolute -bottom-1 left-0 h-[3px] w-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
                initial={{ scaleX: 0, originX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.9, delay: 0.9, ease: [0.22, 1, 0.36, 1] }}
              />
            </span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="text-lg md:text-xl text-muted-foreground max-w-2xl text-balance"
          >
            A multi-agent AI pipeline that ingests plain text, stack traces, and GitHub issues to generate ranked hypotheses, precise reproduction steps, and executable test code.
          </motion.p>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-4 pt-2"
          >
            <Link href="/dashboard">
              <Button
                size="lg"
                className="font-mono text-base px-8 h-12 relative overflow-hidden group shadow-[0_0_30px_rgba(6,182,212,0.25)] hover:shadow-[0_0_50px_rgba(6,182,212,0.4)] transition-shadow duration-500"
                data-testid="open-dashboard-btn"
              >
                <span className="relative z-10 flex items-center gap-2">
                  Open Dashboard
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </span>
                <span className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </Button>
            </Link>
            <Link href="/new">
              <Button variant="outline" size="lg" className="font-mono text-base h-12 border-border/60 hover:border-primary/50 transition-colors">
                New Analysis
              </Button>
            </Link>
          </motion.div>

          {/* Floating stat chips */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.9 }}
            className="flex flex-wrap justify-center gap-3 pt-4"
          >
            {["5 AI Agents", "8 Source Types", "SSE Streaming", "Confidence Scoring", "Test Generation"].map((chip, i) => (
              <motion.span
                key={chip}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 + i * 0.07 }}
                className="text-xs font-mono text-muted-foreground border border-border/40 rounded-full px-3 py-1 bg-card/30 backdrop-blur-sm"
              >
                {chip}
              </motion.span>
            ))}
          </motion.div>
        </motion.div>
      </section>

      {/* ─── Features grid ───────────────────────────────────── */}
      <section className="relative border-t border-border/50 bg-card/20">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/[0.03] to-transparent pointer-events-none" />
        <div className="px-4 py-24 max-w-6xl mx-auto space-y-14">
          <ScrollReveal className="text-center space-y-3">
            <p className="text-xs font-mono text-primary tracking-widest uppercase">Capabilities</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Everything you need to debug faster</h2>
          </ScrollReveal>

          <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-5" staggerDelay={0.09}>
            {FEATURES.map((f) => (
              <StaggerItem key={f.title}>
                <TiltCard intensity={8} className="h-full">
                  <div className="h-full p-6 rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm hover:border-primary/40 transition-colors duration-300 group">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                      <f.icon className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="font-semibold text-base mb-2">{f.title}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
                  </div>
                </TiltCard>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* ─── How it works ─────────────────────────────────────── */}
      <section className="px-4 py-28 max-w-5xl mx-auto space-y-16">
        <ScrollReveal className="text-center space-y-3">
          <p className="text-xs font-mono text-primary tracking-widest uppercase">The Pipeline</p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">How It Works</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">Five specialized agents run in sequence, each building on the last.</p>
        </ScrollReveal>

        <div className="relative">
          {/* Vertical connector line */}
          <motion.div
            className="absolute left-[26px] top-8 w-[2px] bg-gradient-to-b from-primary via-blue-500 to-violet-500 origin-top"
            style={{ height: "calc(100% - 64px)" }}
            initial={{ scaleY: 0 }}
            whileInView={{ scaleY: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
          />

          <StaggerContainer className="space-y-6" staggerDelay={0.14} containerDelay={0.2}>
            {AGENTS.map((step, i) => (
              <StaggerItem key={step.num} direction="left">
                <TiltCard intensity={5} className="ml-14">
                  <div className={`relative p-5 rounded-xl border border-border/50 bg-gradient-to-br ${step.color} bg-card/40 backdrop-blur-sm hover:border-primary/40 transition-colors group`}>
                    {/* Step dot */}
                    <div className="absolute -left-[52px] top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full border-2 border-primary/40 bg-background text-xs font-mono text-primary font-bold shadow-[0_0_12px_rgba(6,182,212,0.3)]">
                      {i + 1}
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-mono text-primary/60 mb-1">Agent {step.num}</p>
                        <h3 className="text-lg font-semibold mb-1.5 group-hover:text-primary transition-colors">{step.title}</h3>
                        <p className="text-muted-foreground text-sm">{step.desc}</p>
                      </div>
                    </div>
                  </div>
                </TiltCard>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* ─── Source Types ─────────────────────────────────────── */}
      <section className="relative border-t border-border/50 bg-card/30 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_50%,rgba(6,182,212,0.06),transparent_60%)] pointer-events-none" />
        <GridBackground />
        <div className="px-4 py-24 max-w-6xl mx-auto space-y-14">
          <ScrollReveal className="text-center space-y-3">
            <p className="text-xs font-mono text-primary tracking-widest uppercase">Integrations</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Supported Source Types</h2>
            <p className="text-muted-foreground">Paste bugs from wherever they happen.</p>
          </ScrollReveal>

          <StaggerContainer className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-4" staggerDelay={0.07}>
            {SOURCE_TYPES.map((source) => (
              <StaggerItem key={source.label}>
                <TiltCard intensity={10}>
                  <div className="flex flex-col p-5 rounded-xl border border-border/50 bg-background/60 backdrop-blur-sm hover:border-primary/50 hover:bg-card/80 transition-all duration-300 group cursor-default h-full">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform group-hover:bg-primary/20">
                      <source.icon className="w-4.5 h-4.5 text-primary" />
                    </div>
                    <div className="font-semibold text-sm mb-1">{source.label}</div>
                    <div className="text-xs text-muted-foreground">{source.desc}</div>
                  </div>
                </TiltCard>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* ─── Bottom CTA ───────────────────────────────────────── */}
      <section className="relative px-4 py-28 overflow-hidden">
        <FloatingOrb className="w-[600px] h-[600px] bg-cyan-500/10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-orb-float" />
        <ScrollReveal className="relative max-w-2xl mx-auto text-center space-y-8">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Ready to stop guessing and start debugging?
          </h2>
          <p className="text-muted-foreground text-lg">
            Submit your first bug report and get a structured analysis in seconds.
          </p>
          <Link href="/new">
            <Button
              size="lg"
              className="font-mono text-base px-10 h-12 shadow-[0_0_40px_rgba(6,182,212,0.3)] hover:shadow-[0_0_60px_rgba(6,182,212,0.45)] transition-shadow duration-500"
            >
              Start Analyzing
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </Link>
        </ScrollReveal>
      </section>
    </div>
  );
}
