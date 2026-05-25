import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, FlaskConical, Copy, CheckCheck, Clock, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useToolHistory } from "@/hooks/use-tool-history";
import { format } from "date-fns";

type Nl2TestResult = {
  testCode: string;
  framework: string;
  explanation: string;
  coverageNotes: string;
};

const FRAMEWORKS = [
  { value: "Jest + TypeScript", label: "Jest + TypeScript" },
  { value: "Jest + JavaScript", label: "Jest + JavaScript" },
  { value: "Vitest", label: "Vitest" },
  { value: "Mocha + Chai", label: "Mocha + Chai" },
  { value: "Pytest", label: "Pytest" },
  { value: "Cypress", label: "Cypress" },
  { value: "Playwright", label: "Playwright" },
  { value: "RSpec", label: "RSpec (Ruby)" },
  { value: "JUnit", label: "JUnit (Java)" },
];

export function Nl2TestPage() {
  const { toast } = useToast();
  const [description, setDescription] = useState("");
  const [framework, setFramework] = useState("Jest + TypeScript");
  const [codeContext, setCodeContext] = useState("");
  const [result, setResult] = useState<Nl2TestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { history, addEntry, clearHistory } = useToolHistory<Nl2TestResult>("nl2test");

  const handleGenerate = async () => {
    if (!description.trim()) {
      toast({ variant: "destructive", title: "Description required", description: "Describe what you want to test." });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/tools/nl2test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, framework, codeContext: codeContext || undefined }),
      });

      if (!res.ok) throw new Error("Request failed");
      const data = await res.json() as Nl2TestResult;
      setResult(data);
      addEntry(`${framework} — ${description.slice(0, 70)}${description.length > 70 ? "…" : ""}`, data);
    } catch {
      toast({ variant: "destructive", title: "Generation failed", description: "Could not generate test. Try again." });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (code?: string) => {
    const text = code ?? result?.testCode;
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const restoreFromHistory = (entry: { result: Nl2TestResult }) => {
    setResult(entry.result);
    setShowHistory(false);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FlaskConical className="w-6 h-6 text-primary" />
              NL2Test — Natural Language to Test
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Describe what you want to test in plain English — get a complete, runnable test case.
            </p>
          </div>
        </div>
        {history.length > 0 && (
          <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={() => setShowHistory(v => !v)}>
            <Clock className="w-4 h-4" />
            History ({history.length})
          </Button>
        )}
      </div>

      {showHistory && history.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Past Generated Tests</CardTitle>
            <Button variant="ghost" size="sm" className="text-destructive h-7 px-2 gap-1.5" onClick={() => { clearHistory(); setShowHistory(false); }}>
              <Trash2 className="w-3.5 h-3.5" /> Clear all
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {history.map(entry => (
              <div key={entry.id} className="rounded-lg border border-border/50 overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge variant="outline" className="text-xs shrink-0 font-mono">{entry.result.framework}</Badge>
                    <span className="text-sm truncate">{entry.label}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className="text-xs text-muted-foreground">{format(new Date(entry.createdAt), "MMM d, HH:mm")}</span>
                    {expandedId === entry.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </div>
                </button>
                {expandedId === entry.id && (
                  <div className="border-t border-border/50 bg-muted/20 px-4 py-3 space-y-2">
                    <pre className="text-xs font-mono bg-muted/40 rounded p-3 max-h-40 overflow-auto whitespace-pre-wrap">
                      {entry.result.testCode.slice(0, 400)}{entry.result.testCode.length > 400 ? "\n…" : ""}
                    </pre>
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => restoreFromHistory(entry)}>
                        View full result
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => handleCopy(entry.result.testCode)}>
                        <Copy className="w-3 h-3" /> Copy
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Test Description</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
                What do you want to test?
              </Label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="e.g. Test what happens when a logged-in user tries to access an admin route — should get 403, not 500"
                rows={5}
                className="resize-none"
              />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
                Framework
              </Label>
              <Select value={framework} onValueChange={setFramework}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FRAMEWORKS.map(f => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
                Code Context <span className="normal-case text-muted-foreground/60">(optional)</span>
              </Label>
              <Textarea
                value={codeContext}
                onChange={e => setCodeContext(e.target.value)}
                placeholder="Paste relevant function signatures, types, or route definitions to make the test more accurate"
                rows={6}
                className="font-mono text-xs resize-none"
              />
            </div>
            <Button onClick={handleGenerate} disabled={loading} className="w-full">
              {loading ? "Generating test..." : "Generate Test Case"}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {loading && (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm">Writing your test case...</p>
              </CardContent>
            </Card>
          )}

          {result && (
            <>
              <Card>
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-medium">Generated Test</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">Framework: {result.framework}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => handleCopy()} className="gap-2">
                    {copied ? <><CheckCheck className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy</>}
                  </Button>
                </CardHeader>
                <CardContent>
                  <pre className="text-xs font-mono bg-muted/30 rounded-lg p-4 overflow-auto max-h-80 whitespace-pre-wrap border border-border">
                    {result.testCode}
                  </pre>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Explanation</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed">{result.explanation}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Coverage Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-muted-foreground">{result.coverageNotes}</p>
                </CardContent>
              </Card>
            </>
          )}

          {!result && !loading && (
            <Card className="border-dashed">
              <CardContent className="py-16 text-center text-muted-foreground">
                <FlaskConical className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Your generated test will appear here</p>
                <p className="text-xs mt-1 opacity-60">Describe what to test, pick a framework, and hit generate</p>
                {history.length > 0 && (
                  <p className="text-xs mt-2 opacity-60">{history.length} past test{history.length !== 1 ? "s" : ""} saved — click History above</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
