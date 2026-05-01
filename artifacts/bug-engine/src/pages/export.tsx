import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useGetAnalysis, useExportAnalysis, getGetAnalysisQueryKey, getGetAnalysisStatsQueryKey } from "@workspace/api-client-react";
import { ArrowLeft, Download, Copy, Printer, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export function ExportPage() {
  const [, params] = useRoute("/analyses/:id/export");
  const id = params?.id ? parseInt(params.id, 10) : 0;
  const { toast } = useToast();

  const { data: analysis, isLoading: loadingAnalysis } = useGetAnalysis(id, {
    query: { enabled: !!id, queryKey: getGetAnalysisQueryKey(id) }
  });

  // Re-use useExportAnalysis but the query hook name might be different. Let's rely on what's available
  const { data: exportData, isLoading: loadingExport } = useExportAnalysis(id, {
    query: { enabled: !!id && analysis?.status === "completed", queryKey: ["export", id] }
  });

  const [copied, setCopied] = useState(false);

  if (loadingAnalysis || loadingExport) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!analysis) {
    return <div>Analysis not found</div>;
  }

  if (analysis.status !== "completed") {
    return (
      <div className="max-w-4xl mx-auto text-center py-12 space-y-4">
        <h2 className="text-2xl font-bold">Analysis not complete</h2>
        <p className="text-muted-foreground">Run the pipeline first to generate a report.</p>
        <Link href={`/analyses/${id}`}>
          <Button variant="outline">Back to Analysis</Button>
        </Link>
      </div>
    );
  }

  const handleCopy = () => {
    if (exportData?.markdown) {
      navigator.clipboard.writeText(exportData.markdown);
      setCopied(true);
      toast({ title: "Copied!", description: "Markdown copied to clipboard." });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (exportData?.markdown) {
      const blob = new Blob([exportData.markdown], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${exportData.title.replace(/\s+/g, "_").toLowerCase()}_report.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
      <div className="flex items-center justify-between no-print">
        <div className="flex items-center gap-4">
          <Link href={`/analyses/${id}`}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Export Report</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleCopy} data-testid="copy-markdown-btn">
            {copied ? <CheckCircle className="w-4 h-4 mr-2 text-green-500" /> : <Copy className="w-4 h-4 mr-2" />}
            Copy Markdown
          </Button>
          <Button variant="outline" onClick={handleDownload} data-testid="download-md-btn">
            <Download className="w-4 h-4 mr-2" />
            Download .md
          </Button>
          <Button variant="outline" onClick={handlePrint} data-testid="print-btn">
            <Printer className="w-4 h-4 mr-2" />
            Print
          </Button>
        </div>
      </div>

      <div className="bg-card border border-border/50 rounded-lg p-8 md:p-12 print:border-none print:p-0 print:bg-white print:text-black">
        <div className="border-b border-border/50 pb-6 mb-8 print:border-gray-200">
          <h1 className="text-3xl font-bold mb-4">{analysis.title}</h1>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground print:text-gray-600">
            <span>Source: {analysis.inputType}</span>
            <span>Date: {format(new Date(analysis.createdAt), "PPP")}</span>
            {analysis.confidenceScore != null && (
              <span>Confidence: {Math.round(analysis.confidenceScore * 100)}%</span>
            )}
          </div>
        </div>

        <div className="prose prose-invert max-w-none print:prose-p:text-black print:prose-headings:text-black print:prose-a:text-blue-600">
          <h2>1. Extracted Entities</h2>
          <pre className="bg-muted/50 p-4 rounded text-sm font-mono overflow-x-auto print:bg-gray-100">{analysis.extractedEntities || "None"}</pre>

          <h2>2. Hypotheses</h2>
          <div className="whitespace-pre-wrap">{analysis.hypotheses || "None"}</div>

          <h2>3. Reproduction Steps</h2>
          <div className="whitespace-pre-wrap font-mono text-sm">{analysis.reproductionSteps || "None"}</div>

          <h2>4. Test Code</h2>
          <pre className="bg-muted/50 p-4 rounded text-sm font-mono overflow-x-auto print:bg-gray-100">{analysis.testCode || "// No test code"}</pre>

          <h2>5. Flow Diagram</h2>
          <div className="bg-muted/30 p-4 rounded print:bg-gray-50">
            <pre className="text-sm font-mono whitespace-pre-wrap">Mermaid Diagram\n{analysis.flowDiagram || "No diagram"}</pre>
          </div>

          {analysis.clarifyingQuestions && (
            <>
              <h2>6. Clarifying Questions</h2>
              <div className="whitespace-pre-wrap text-destructive-foreground print:text-red-600">{analysis.clarifyingQuestions}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
