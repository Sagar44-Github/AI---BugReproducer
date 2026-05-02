import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLocation } from "wouter";
import { useCreateAnalysis, CreateAnalysisBodyInputType } from "@workspace/api-client-react";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, BugPlay, Loader2, FileText, Terminal, CheckCircle, AlertTriangle, Server, Globe, Video, Download } from "lucide-react";
import { SiGithub } from "react-icons/si";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
// Import fetch issue mutator here if available or use standard fetch
// Assuming useFetchGithubIssue is available in the real api-client, 
// if not we will mock the functionality to avoid build errors.
// const useFetchGithubIssue = ... 

const SOURCE_TYPES = [
  { id: "raw_text", icon: FileText, label: "Raw Text", desc: "Paste a bug description in plain English", placeholder: "Describe the bug: what you did, what you expected, what actually happened..." },
  { id: "github_url", icon: SiGithub, label: "GitHub Issue", desc: "Paste a GitHub issue URL to auto-fetch content", placeholder: "The fetched issue content will appear here after you click 'Fetch Issue', or paste it manually..." },
  { id: "stack_trace", icon: Terminal, label: "Stack Trace", desc: "Paste a stack trace or error output", placeholder: "Paste the full stack trace here, including the error type and call chain..." },
  { id: "jira_ticket", icon: CheckCircle, label: "Jira Ticket", desc: "Paste a Jira ticket description or URL", placeholder: "Paste the Jira ticket description, steps to reproduce, and any comments..." },
  { id: "sentry_event", icon: AlertTriangle, label: "Sentry Event", desc: "Paste a Sentry event URL, ID, or error details", placeholder: "Paste the Sentry event details, exception info, breadcrumbs, and context..." },
  { id: "log_file", icon: Server, label: "Log File", desc: "Paste log file output around the time of the bug", placeholder: "Paste the relevant log output, including lines before and after the error..." },
  { id: "curl_request", icon: Globe, label: "cURL Request", desc: "Paste a failed curl command or API request/response", placeholder: "Paste the curl command and/or the request/response that failed..." },
  { id: "video_description", icon: Video, label: "Video / Recording", desc: "Describe what you see in a screen recording", placeholder: "Describe what you see: user actions, what appears on screen, when it breaks..." },
] as const;

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  inputType: z.enum(["raw_text", "github_url", "stack_trace", "jira_ticket", "sentry_event", "log_file", "curl_request", "video_description"] as const),
  rawInput: z.string().min(1, "Raw input is required"),
  githubUrl: z.string().optional(),
  codeContext: z.string().optional(),
  tags: z.string().optional(),
  autoRun: z.boolean().default(false),
});

type FormValues = z.infer<typeof formSchema>;

export function NewAnalysis() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isFetchingIssue, setIsFetchingIssue] = useState(false);
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      inputType: "raw_text",
      rawInput: "",
      githubUrl: "",
      codeContext: "",
      tags: "",
      autoRun: false,
    },
  });

  const createAnalysis = useCreateAnalysis();
  const inputType = form.watch("inputType");

  const handleFetchIssue = async () => {
    const url = form.getValues("githubUrl");
    if (!url) {
      toast({ variant: "destructive", title: "Error", description: "Please enter a GitHub URL" });
      return;
    }
    
    setIsFetchingIssue(true);
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/github/fetch-issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      
      if (!response.ok) throw new Error("Failed to fetch issue");
      const data = await response.json();
      
      // Use server-assembled formattedContent if available (handles truncation)
      const formatted = data.formattedContent ?? `Title: ${data.title}\n\nState: ${data.state}\nAuthor: @${data.author}\nLabels: ${(data.labels || []).join(', ')}\n\nDescription:\n${data.body}\n\nComments:\n${(data.comments || []).join('\n\n')}`;
      
      form.setValue("rawInput", formatted);
      if (!form.getValues("title")) {
        form.setValue("title", data.title);
      }
      
      if (data.truncated) {
        toast({
          variant: "destructive",
          title: "Issue content was truncated",
          description: `The issue has ${data.originalCommentCount} comments. Long comment threads were trimmed to prevent context overflow — the pipeline will still receive the most important content.`,
        });
      } else {
        toast({ title: "Issue fetched successfully" });
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed to fetch issue", description: err.message });
    } finally {
      setIsFetchingIssue(false);
    }
  };

  const onSubmit = (values: FormValues) => {
    createAnalysis.mutate(
      {
        data: {
          title: values.title,
          inputType: values.inputType as CreateAnalysisBodyInputType,
          rawInput: values.rawInput,
          githubUrl: values.githubUrl || undefined,
          codeContext: values.codeContext || undefined,
          tags: values.tags || undefined,
        },
      },
      {
        onSuccess: (analysis) => {
          toast({
            title: "Analysis created",
            description: values.autoRun ? "Starting pipeline..." : "Ready to run pipeline.",
          });
          setLocation(`/analyses/${analysis.id}${values.autoRun ? "?autorun=1" : ""}`);
        },
        onError: (error) => {
          toast({
            variant: "destructive",
            title: "Failed to create analysis",
            description: (error as unknown as { error?: string }).error || "An unexpected error occurred",
          });
        },
      }
    );
  };

  const selectedSource = SOURCE_TYPES.find(s => s.id === inputType);

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500 pb-16">
      <div className="flex items-center gap-4">
        <Link href="/">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Analysis</h1>
          <p className="text-sm text-muted-foreground">Submit a bug report to generate a reproduction pipeline.</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          
          <div className="space-y-4">
            <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">1. Select Source Type</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {SOURCE_TYPES.map((source) => {
                const isSelected = inputType === source.id;
                return (
                  <div
                    key={source.id}
                    onClick={() => form.setValue("inputType", source.id as any)}
                    className={`cursor-pointer rounded-xl border p-4 transition-all duration-200 ${
                      isSelected 
                        ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/30" 
                        : "border-border/50 bg-card/30 hover:border-primary/50 hover:bg-card/80"
                    }`}
                    data-testid={`source-type-${source.id}`}
                  >
                    <source.icon className={`w-6 h-6 mb-3 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                    <div className={`font-semibold text-sm mb-1 ${isSelected ? "text-foreground" : "text-foreground/80"}`}>
                      {source.label}
                    </div>
                    <div className="text-xs text-muted-foreground leading-snug">
                      {source.desc}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <Card className="bg-card/50 backdrop-blur-sm border-border/50">
            <CardHeader>
              <CardTitle>Bug Details</CardTitle>
              <CardDescription>Provide the necessary information to reproduce the issue.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Cannot login when using SSO with Safari" {...field} className="font-mono text-sm" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {inputType === "github_url" && (
                <div className="space-y-3 p-4 border border-border/50 rounded-lg bg-background/50">
                  <FormField
                    control={form.control}
                    name="githubUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>GitHub Issue URL</FormLabel>
                        <div className="flex gap-2">
                          <FormControl>
                            <Input placeholder="https://github.com/org/repo/issues/123" {...field} className="font-mono text-sm" />
                          </FormControl>
                          <Button 
                            type="button" 
                            variant="secondary" 
                            onClick={handleFetchIssue}
                            disabled={isFetchingIssue || !field.value}
                            data-testid="fetch-issue-btn"
                          >
                            {isFetchingIssue ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                            Fetch Issue
                          </Button>
                        </div>
                        <FormDescription>Auto-fetch the title, body, and comments.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              <FormField
                control={form.control}
                name="rawInput"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Raw Input / Bug Description</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder={selectedSource?.placeholder || ""} 
                        className="min-h-[200px] font-mono text-sm resize-y" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tags"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tags (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="frontend, authentication, safari (comma separated)" {...field} className="font-mono text-sm" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="code-context" className="border-border/50">
                  <AccordionTrigger className="text-sm hover:no-underline">
                    Add code context (optional)
                  </AccordionTrigger>
                  <AccordionContent>
                    <FormField
                      control={form.control}
                      name="codeContext"
                      render={({ field }) => (
                        <FormItem>
                          <FormDescription className="mb-2">Any relevant code snippets, config files, or environment details.</FormDescription>
                          <FormControl>
                            <Textarea 
                              placeholder="// Optional: Paste relevant code snippets here" 
                              className="min-h-[150px] font-mono text-sm bg-muted/50 resize-y" 
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <div className="flex items-center justify-between pt-4 border-t border-border/50">
                <FormField
                  control={form.control}
                  name="autoRun"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="autorun-checkbox"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="cursor-pointer font-normal text-sm">
                          Automatically run pipeline after creating
                        </FormLabel>
                      </div>
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  disabled={createAnalysis.isPending}
                  className="font-mono"
                  data-testid="submit-analysis-btn"
                >
                  {createAnalysis.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <BugPlay className="mr-2 h-4 w-4" />
                  )}
                  Create Analysis
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </Form>
    </div>
  );
}
