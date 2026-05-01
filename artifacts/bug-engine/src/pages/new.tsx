import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLocation } from "wouter";
import { useCreateAnalysis, CreateAnalysisBodyInputType } from "@workspace/api-client-react";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, BugPlay, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  inputType: z.enum(["raw_text", "github_url", "stack_trace"] as const),
  rawInput: z.string().min(1, "Raw input is required"),
  githubUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  codeContext: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function NewAnalysis() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      inputType: "raw_text",
      rawInput: "",
      githubUrl: "",
      codeContext: "",
    },
  });

  const createAnalysis = useCreateAnalysis();

  const onSubmit = (values: FormValues) => {
    createAnalysis.mutate(
      {
        data: {
          title: values.title,
          inputType: values.inputType as CreateAnalysisBodyInputType,
          rawInput: values.rawInput,
          githubUrl: values.githubUrl || undefined,
          codeContext: values.codeContext || undefined,
        },
      },
      {
        onSuccess: (analysis) => {
          toast({
            title: "Analysis created",
            description: "Ready to run pipeline.",
          });
          setLocation(`/analyses/${analysis.id}`);
        },
        onError: (error) => {
          toast({
            variant: "destructive",
            title: "Failed to create analysis",
            description: error.error || "An unexpected error occurred",
          });
        },
      }
    );
  };

  const inputType = form.watch("inputType");

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
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

      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader>
          <CardTitle>Bug Details</CardTitle>
          <CardDescription>Provide as much context as possible for accurate reproduction.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="inputType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Source Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="font-mono text-sm">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="raw_text">User Report (Raw Text)</SelectItem>
                          <SelectItem value="github_url">GitHub Issue URL</SelectItem>
                          <SelectItem value="stack_trace">Stack Trace</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {inputType === "github_url" && (
                  <FormField
                    control={form.control}
                    name="githubUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>GitHub URL</FormLabel>
                        <FormControl>
                          <Input placeholder="https://github.com/org/repo/issues/123" {...field} className="font-mono text-sm" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              <FormField
                control={form.control}
                name="rawInput"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Raw Input / Bug Description</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder={
                          inputType === "stack_trace" 
                            ? "Paste the stack trace here..." 
                            : "Paste the original user report, slack message, or issue body here..."
                        } 
                        className="min-h-[150px] font-mono text-sm resize-y" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="codeContext"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code Context (Optional)</FormLabel>
                    <FormDescription>Any relevant code snippets, config files, or environment details.</FormDescription>
                    <FormControl>
                      <Textarea 
                        placeholder="// Optional: Paste relevant code snippets here" 
                        className="min-h-[100px] font-mono text-sm bg-muted/50 resize-y" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end pt-4 border-t border-border/50">
                <Button 
                  type="submit" 
                  disabled={createAnalysis.isPending}
                  className="font-mono"
                >
                  {createAnalysis.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <BugPlay className="mr-2 h-4 w-4" />
                  )}
                  Initialize Analysis
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
