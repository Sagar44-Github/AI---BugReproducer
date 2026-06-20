import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Github, FileText, GitMerge, Terminal, CheckCircle, AlertTriangle, Server, RefreshCw, MonitorPlay } from "lucide-react";

export function Settings() {
  const agents = [
    { name: "Entity Extraction", purpose: "Identifies components, trigger actions, expected vs actual, environment, error messages", model: "llama-3.3-70b-versatile" },
    { name: "Hypothesis Generator", purpose: "Creates 3-5 ranked root cause theories with retained/eliminated status", model: "llama-3.3-70b-versatile" },
    { name: "Step Validator", purpose: "Produces precise, numbered reproduction steps with prerequisites", model: "llama-3.3-70b-versatile" },
    { name: "Test Writer", purpose: "Generates executable test code with server-side syntax validation", model: "llama-3.3-70b-versatile" },
    { name: "Analysis Synthesizer", purpose: "Mermaid flow diagram, clarifying questions, severity classification", model: "llama-3.3-70b-versatile" },
    { name: "Fix Suggester", purpose: "3-5 ranked concrete code fix suggestions with location and effort", model: "llama-3.3-70b-versatile" },
    { name: "Auto-Tagger", purpose: "3-8 lowercase hyphenated taxonomy tags for search and classification", model: "llama-3.3-70b-versatile" },
  ];

  const sourceTypes = [
    { icon: FileText, label: "Raw Text", desc: "Paste a bug description in plain English" },
    { icon: GitMerge, label: "GitHub Issue", desc: "Paste a GitHub issue URL to auto-fetch content" },
    { icon: Terminal, label: "Stack Trace", desc: "Paste a stack trace or error output" },
    { icon: CheckCircle, label: "Jira Ticket", desc: "Paste a Jira ticket description or URL" },
    { icon: AlertTriangle, label: "Sentry Event", desc: "Paste a Sentry event URL, ID, or error details" },
    { icon: Server, label: "Log File", desc: "Paste log file output around the time of the bug" },
    { icon: RefreshCw, label: "curl / API Request", desc: "Paste a failed curl command or API request/response" },
    { icon: MonitorPlay, label: "Video / Recording", desc: "Describe what you see in a screen recording" },
    { icon: MonitorPlay, label: "Screenshot", desc: "Describe what's visible in a bug screenshot" },
    { icon: MonitorPlay, label: "Perf Profile", desc: "Paste a profiler output or performance trace" },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-12 animate-in fade-in duration-500 pb-16">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings & About</h1>
        <p className="text-muted-foreground mt-1">Configure and learn about the BugRepro Engine.</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold border-b border-border/50 pb-2">About</h2>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-6">
            <div className="space-y-4">
              <div>
                <div className="font-bold text-lg">BugRepro Engine</div>
                <div className="text-sm text-muted-foreground">Version 1.0.0</div>
              </div>
              <p className="text-sm">
                An advanced multi-agent AI tool that transforms varied bug reports into actionable hypotheses, reproduction steps, and executable test code.
              </p>
              <div className="flex gap-4 pt-2">
                <a href="#" className="text-sm text-primary hover:underline flex items-center gap-1">
                  <Github className="w-4 h-4" /> GitHub Repository
                </a>
                <a href="#" className="text-sm text-primary hover:underline flex items-center gap-1">
                  <FileText className="w-4 h-4" /> Documentation
                </a>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold border-b border-border/50 pb-2">Pipeline Agents</h2>
        <p className="text-sm text-muted-foreground">The system uses a sequential multi-agent architecture. Each agent handles a specific part of the bug reproduction process.</p>
        <div className="border border-border/50 rounded-md overflow-hidden bg-card/50">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Agent Name</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Model Used</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((agent) => (
                <TableRow key={agent.name}>
                  <TableCell className="font-medium font-mono text-sm">{agent.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{agent.purpose}</TableCell>
                  <TableCell className="font-mono text-xs text-primary">{agent.model}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold border-b border-border/50 pb-2">Source Types</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sourceTypes.map((source, i) => (
            <Card key={i} className="bg-card/50 border-border/50">
              <CardContent className="p-4 flex gap-4 items-start">
                <source.icon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium text-sm mb-1">{source.label}</div>
                  <div className="text-xs text-muted-foreground">{source.desc}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold border-b border-border/50 pb-2">Tips for Best Results</h2>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-6">
            <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
              <li><strong className="text-foreground">Include the full stack trace:</strong> Don't truncate logs; the agents use the full call chain to pinpoint the exact failure location.</li>
              <li><strong className="text-foreground">Add code context:</strong> Provide relevant configuration, environment variables, or snippets for more accurate test generation.</li>
              <li><strong className="text-foreground">Use GitHub URL mode:</strong> When dealing with GitHub issues, paste the URL instead of text to automatically fetch metadata, labels, and comments.</li>
              <li><strong className="text-foreground">Be specific with video descriptions:</strong> For visual bugs, describe what you see happening second-by-second.</li>
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
