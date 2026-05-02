import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Shuffle, AlertTriangle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type FlakyTest = {
  testName: string;
  riskLevel: "high" | "medium" | "low";
  category: string;
  explanation: string;
  fix: string;
};

type FlakyDetectorResult = {
  flakyTests: FlakyTest[];
  overallRisk: "high" | "medium" | "low" | "none";
  summary: string;
};

const riskConfig = {
  high: { label: "High Risk", color: "text-red-400", badge: "destructive" as const },
  medium: { label: "Medium Risk", color: "text-amber-400", badge: "secondary" as const },
  low: { label: "Low Risk", color: "text-blue-400", badge: "outline" as const },
  none: { label: "None", color: "text-green-400", badge: "outline" as const },
};

const categoryLabels: Record<string, string> = {
  race_condition: "Race Condition",
  environment_dependency: "Environment Dependency",
  non_deterministic_data: "Non-Deterministic Data",
  timing: "Timing Issue",
  external_dependency: "External Dependency",
  state_leak: "State Leak",
  other: "Other",
};

const LANGUAGES = [
  { value: "JavaScript/TypeScript", label: "JavaScript / TypeScript" },
  { value: "Python", label: "Python" },
  { value: "Ruby", label: "Ruby" },
  { value: "Java", label: "Java" },
  { value: "Go", label: "Go" },
  { value: "Rust", label: "Rust" },
];

export function FlakyDetectorPage() {
  const { toast } = useToast();
  const [testCode, setTestCode] = useState("");
  const [language, setLanguage] = useState("JavaScript/TypeScript");
  const [result, setResult] = useState<FlakyDetectorResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAnalyze = async () => {
    if (!testCode.trim()) {
      toast({ variant: "destructive", title: "Test code required", description: "Paste your test suite to analyze." });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/tools/flaky-detector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testCode, language }),
      });

      if (!res.ok) throw new Error("Request failed");
      const data = await res.json() as FlakyDetectorResult;
      setResult(data);
    } catch {
      toast({ variant: "destructive", title: "Analysis failed", description: "Could not analyze test suite. Try again." });
    } finally {
      setLoading(false);
    }
  };

  const overallCfg = result ? riskConfig[result.overallRisk] : null;

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shuffle className="w-6 h-6 text-primary" />
            Flaky Test Detector
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Paste your test suite — AI identifies which tests are flaky and explains exactly why.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Test Suite</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">Language / Framework</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map(l => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">Test Code</Label>
              <Textarea
                value={testCode}
                onChange={e => setTestCode(e.target.value)}
                placeholder={"// Paste your test file or test suite here\ndescribe('AuthService', () => {\n  it('should refresh token', async () => {\n    // ...\n  });\n});"}
                rows={16}
                className="font-mono text-xs resize-none"
              />
            </div>
            <Button onClick={handleAnalyze} disabled={loading} className="w-full">
              {loading ? "Analyzing for flakiness..." : "Detect Flaky Tests"}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {loading && (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm">Analyzing for race conditions, timing issues, and state leaks...</p>
              </CardContent>
            </Card>
          )}

          {result && (
            <>
              <Card className={result.overallRisk === "none" ? "border-green-500/20 bg-green-500/5" : "border-primary/20 bg-primary/5"}>
                <CardContent className="pt-5 flex items-start gap-4">
                  {result.overallRisk === "none"
                    ? <CheckCircle className="w-8 h-8 text-green-400 shrink-0 mt-0.5" />
                    : <AlertTriangle className="w-8 h-8 text-amber-400 shrink-0 mt-0.5" />
                  }
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold">Overall Risk</span>
                      <Badge variant={riskConfig[result.overallRisk].badge} className="text-xs">
                        {riskConfig[result.overallRisk].label}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{result.summary}</p>
                  </div>
                </CardContent>
              </Card>

              {result.flakyTests.length === 0 ? (
                <Card>
                  <CardContent className="py-10 text-center text-green-400">
                    <CheckCircle className="w-10 h-10 mx-auto mb-3" />
                    <p className="font-medium">No flaky tests detected</p>
                    <p className="text-sm text-muted-foreground mt-1">Your test suite looks reliable.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                    {result.flakyTests.length} Flaky Test{result.flakyTests.length !== 1 ? "s" : ""} Found
                  </h3>
                  {result.flakyTests.map((test, i) => {
                    const cfg = riskConfig[test.riskLevel];
                    return (
                      <Card key={i}>
                        <CardContent className="pt-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <code className="text-sm font-medium font-mono leading-tight">{test.testName}</code>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant="outline" className="text-xs">
                                {categoryLabels[test.category] ?? test.category}
                              </Badge>
                              <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground">{test.explanation}</p>
                          <div className="bg-muted/30 rounded-lg p-3 border border-border">
                            <p className="text-xs font-medium text-primary mb-1">Suggested Fix</p>
                            <p className="text-xs text-muted-foreground">{test.fix}</p>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {!result && !loading && (
            <Card className="border-dashed">
              <CardContent className="py-16 text-center text-muted-foreground">
                <Shuffle className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Analysis results will appear here</p>
                <p className="text-xs mt-1 opacity-60">Paste a test file and hit Detect</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
