import { useState, useRef, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useGetAnalysis, 
  getGetAnalysisQueryKey, 
  useDeleteAnalysis 
} from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft, BugPlay, Loader2, CheckCircle2, AlertCircle, 
  Code2, GitMerge, Search, FileText, Trash2, StopCircle
} from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

type AgentEvent = {
  type: "agent_start" | "agent_output" | "agent_done" | "pipeline_done" | "error";
  agentName: string;
  content: string;
};

type AgentState = {
  name: string;
  status: "pending" | "running" | "completed" | "error";
  output: string;
};

export function AnalysisDetail() {
  const [, params] = useRoute("/analyses/:id");
  const id = params?.id ? parseInt(params.id, 10) : 0;
  const [, setLocation] = useRoute();
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

      if (!response.ok) {
        throw new Error(`Failed to start pipeline: ${response.statusText}`);
      }

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
                toast({
                  title: "Pipeline Complete",
                  description: "Bug reproduction analysis finished successfully.",
                });
                break;
              }

              if (event.type === "error") {
                setPipelineError(event.content);
                setIsRunning(false);
                queryClient.invalidateQueries({ queryKey: getGetAnalysisQueryKey(id) });
                break;
              }

              if (event.agentName) {
                setAgents(prev => {
                  const currentState = prev[event.agentName] || { 
                    name: event.agentName, 
                    status: "pending", 
                    output: "" 
                  };

                  let newStatus = currentState.status;
                  let newOutput = currentState.output;

                  if (event.type === "agent_start") newStatus = "running";
                  else if (event.type === "agent_output") {
                    newStatus = "running";
                    newOutput += event.content;
                  }
                  else if (event.type === "agent_done") newStatus = "completed";
                  else if (event.type === "error") newStatus = "error";

                  return {
                    ...prev,
                    [event.agentName]: {
                      ...currentState,
                      status: newStatus,
                      output: newOutput
                    }
                  };
                });
              }

            } catch (e) {
              console.error("Error parsing SSE event:", e);
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
         console.log("Pipeline aborted");
      } else {
         setPipelineError(err.message || "An unexpected error occurred");
         toast({
           variant: "destructive",
           title: "Pipeline Error",
           description: err.message || "Failed to run analysis pipeline",
         });
      }
      setIsRunning(false);
      queryClient.invalidateQueries({ queryKey: getGetAnalysisQueryKey(id) });
    }
  };

  const stopPipeline = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsRunning(false);
      toast({
        title: "Pipeline Stopped",
        description: "The analysis run was manually cancelled.",
      });
    }
  };

  const handleDelete = () => {
    deleteAnalysis.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Analysis deleted" });
          setLocation("/");
        },
        onError: (err) => {
          toast({
            variant: "destructive",
            title: "Error deleting analysis",
            description: err.error || "Unknown error"
          });
        }
      }
    );
  };

  // Auto-scroll outputs
  const outputEndRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    Object.values(agents).forEach(agent => {
      if (agent.status === "running" && outputEndRefs.current[agent.name]) {
        outputEndRefs.current[agent.name]?.scrollIntoView({ behavior: "smooth" });
      }
    });
  }, [agents]);

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex gap-4">
          <Skeleton className="w-8 h-8 rounded-md" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-4 w-1/4" />
          </div>
        </div>
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
        <Link href="/">
          <Button variant="outline">Return to Dashboard</Button>
        </Link>
      </div>
    );
  }

  const hasResults = analysis.status === "completed" || analysis.status === "failed";
  const agentList = Object.values(agents);

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="flex gap-4 items-start flex-1 min-w-0">
          <Link href="/">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 mt-1">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight truncate">{analysis.title}</h1>
              <StatusBadge status={analysis.status} />
              {analysis.confidenceScore != null && (
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs">
                  Confidence: {Math.round(analysis.confidenceScore * 100)}%
                </Badge>
              )}
            </div>
            <div className="text-sm text-muted-foreground flex items-center gap-4">
              <span>{analysis.inputType.replace("_", " ")}</span>
              <span>•</span>
              <span>{format(new Date(analysis.createdAt), "PP pp")}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 shrink-0 self-end md:self-start mt-2 md:mt-0">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10 border-destructive/20">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Analysis</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this analysis? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          
          {!isRunning ? (
            <Button 
              onClick={startPipeline} 
              className="font-mono bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <BugPlay className="w-4 h-4 mr-2" />
              {hasResults ? "Rerun Pipeline" : "Run Pipeline"}
            </Button>
          ) : (
            <Button 
              onClick={stopPipeline} 
              variant="destructive"
              className="font-mono"
            >
              <StopCircle className="w-4 h-4 mr-2" />
              Stop Run
            </Button>
          )}
        </div>
      </div>

      <Card className="bg-card border-border/50 shadow-sm">
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Original Context</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="max-h-64 bg-black/40 rounded-b-lg">
            <div className="p-4 font-mono text-sm whitespace-pre-wrap text-muted-foreground">
              {analysis.rawInput}
            </div>
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
                <motion.div
                  key={agent.name}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <Card className={`border-border/50 overflow-hidden ${agent.status === 'running' ? 'ring-1 ring-primary/50' : ''}`}>
                    <div className="bg-muted/30 px-4 py-3 flex items-center justify-between border-b border-border/50">
                      <div className="flex items-center gap-2 font-mono text-sm font-semibold">
                        <Code2 className="w-4 h-4 text-primary" />
                        {agent.name}
                      </div>
                      <div className="flex items-center gap-2">
                        {agent.status === "running" && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
                        {agent.status === "completed" && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                        {agent.status === "error" && <AlertCircle className="w-4 h-4 text-destructive" />}
                        <span className="text-xs uppercase tracking-wider text-muted-foreground font-mono">
                          {agent.status}
                        </span>
                      </div>
                    </div>
                    {agent.output && (
                      <div className="bg-[#0a0a0a] p-4 text-xs font-mono text-gray-300 whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                        {agent.output}
                        {agent.status === "running" && (
                          <span className="inline-block w-2 h-3 ml-1 bg-primary animate-pulse" />
                        )}
                        <div ref={el => outputEndRefs.current[agent.name] = el} />
                      </div>
                    )}
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
            
            {pipelineError && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Card className="border-destructive/50 bg-destructive/10">
                  <CardContent className="p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                    <div className="text-sm font-mono text-destructive-foreground whitespace-pre-wrap">
                      {pipelineError}
                    </div>
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
            <TabsList className="w-full grid grid-cols-2 md:grid-cols-5 bg-card border border-border/50 h-auto p-1 gap-1">
              <TabsTrigger value="steps" className="font-mono text-xs py-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">Reproduction</TabsTrigger>
              <TabsTrigger value="test" className="font-mono text-xs py-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">Test Code</TabsTrigger>
              <TabsTrigger value="hypotheses" className="font-mono text-xs py-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">Hypotheses</TabsTrigger>
              <TabsTrigger value="diagram" className="font-mono text-xs py-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">Flow</TabsTrigger>
              <TabsTrigger value="questions" className="font-mono text-xs py-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">Clarifications</TabsTrigger>
            </TabsList>
            
            <div className="mt-4">
              <TabsContent value="steps" className="m-0">
                <Card className="border-border/50 bg-card shadow-sm">
                  <CardContent className="p-0">
                    <div className="bg-[#0a0a0a] rounded-lg p-6 font-mono text-sm whitespace-pre-wrap text-gray-300">
                      {analysis.reproductionSteps || "No reproduction steps generated."}
                    </div>
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
                    <div className="prose prose-invert max-w-none font-sans text-sm">
                      <div className="whitespace-pre-wrap text-muted-foreground">
                        {analysis.hypotheses || "No hypotheses generated."}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="diagram" className="m-0">
                <Card className="border-border/50 bg-card shadow-sm">
                  <CardContent className="p-6">
                    <div className="bg-muted/30 rounded border border-border/50 p-6 flex flex-col items-center justify-center min-h-[300px]">
                      <GitMerge className="w-8 h-8 text-primary/50 mb-4" />
                      <div className="font-mono text-sm whitespace-pre-wrap text-center max-w-2xl text-muted-foreground">
                        {analysis.flowDiagram || "Flow diagram visualization not available."}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="questions" className="m-0">
                <Card className="border-border/50 bg-card shadow-sm">
                  <CardContent className="p-6">
                    <div className="bg-destructive/5 rounded-lg border border-destructive/20 p-6 font-mono text-sm whitespace-pre-wrap text-destructive-foreground">
                      {analysis.clarifyingQuestions || "No clarifying questions needed."}
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
