import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { FolderKanban, Plus, Pencil, Trash2, Webhook, Globe } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Project = {
  id: number;
  name: string;
  description: string | null;
  defaultFramework: string | null;
  slackWebhookUrl: string | null;
  discordWebhookUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

type ProjectForm = {
  name: string;
  description: string;
  defaultFramework: string;
  slackWebhookUrl: string;
  discordWebhookUrl: string;
};

const emptyForm: ProjectForm = {
  name: "",
  description: "",
  defaultFramework: "",
  slackWebhookUrl: "",
  discordWebhookUrl: "",
};

async function fetchProjects(): Promise<Project[]> {
  const r = await fetch(`${BASE}/api/projects`);
  if (!r.ok) throw new Error("Failed to fetch projects");
  return r.json() as Promise<Project[]>;
}

async function createProject(body: Partial<ProjectForm>): Promise<Project> {
  const r = await fetch(`${BASE}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("Failed to create project");
  return r.json() as Promise<Project>;
}

async function updateProject(id: number, body: Partial<ProjectForm>): Promise<Project> {
  const r = await fetch(`${BASE}/api/projects/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("Failed to update project");
  return r.json() as Promise<Project>;
}

async function deleteProject(id: number): Promise<void> {
  const r = await fetch(`${BASE}/api/projects/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error("Failed to delete project");
}

function ProjectFormDialog({
  open,
  onOpenChange,
  initial,
  onSave,
  title,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: ProjectForm;
  onSave: (f: ProjectForm) => void;
  title: string;
}) {
  const [form, setForm] = useState<ProjectForm>(initial);
  const set = (k: keyof ProjectForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (v) setForm(initial); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Project Name *</label>
            <Input value={form.name} onChange={set("name")} placeholder="Auth Service" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Description</label>
            <Textarea value={form.description} onChange={set("description")} placeholder="All auth-related bugs and analyses" rows={2} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Default Test Framework</label>
            <Input value={form.defaultFramework} onChange={set("defaultFramework")} placeholder="Jest, Pytest, Vitest…" />
          </div>
          <div className="border-t border-border/50 pt-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Webhook className="w-3.5 h-3.5" /> Webhook Notifications (optional)
            </p>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Slack Webhook URL</label>
              <Input value={form.slackWebhookUrl} onChange={set("slackWebhookUrl")} placeholder="https://hooks.slack.com/services/…" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Discord Webhook URL</label>
              <Input value={form.discordWebhookUrl} onChange={set("discordWebhookUrl")} placeholder="https://discord.com/api/webhooks/…" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!form.name.trim()} onClick={() => { onSave(form); onOpenChange(false); }}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProjectsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Project | null>(null);

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
  });

  const create = useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["projects"] });
      toast({ title: "Project created" });
    },
    onError: () => toast({ title: "Failed to create project", variant: "destructive" }),
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<ProjectForm> }) => updateProject(id, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["projects"] });
      toast({ title: "Project updated" });
    },
    onError: () => toast({ title: "Failed to update project", variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["projects"] });
      toast({ title: "Project deleted" });
    },
    onError: () => toast({ title: "Failed to delete project", variant: "destructive" }),
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <FolderKanban className="w-7 h-7 text-primary" /> Projects
          </h1>
          <p className="text-muted-foreground mt-1">Organise analyses into projects. Add Slack or Discord webhooks for pipeline notifications.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> New Project
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-36 rounded-xl" />)}
        </div>
      ) : projects && projects.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map(p => (
            <Card key={p.id} className="bg-card/50 border-border/50 hover:border-primary/20 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base font-semibold truncate">{p.name}</CardTitle>
                    {p.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{p.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setEditTarget(p)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Project</AlertDialogTitle>
                          <AlertDialogDescription>
                            Delete &ldquo;{p.name}&rdquo;? This does not delete any analyses — they will become unlinked.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => remove.mutate(p.id)}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                <div className="flex flex-wrap gap-2">
                  {p.defaultFramework && (
                    <Badge variant="secondary" className="text-xs">{p.defaultFramework}</Badge>
                  )}
                  {p.slackWebhookUrl && (
                    <Badge variant="outline" className="text-xs gap-1">
                      <Webhook className="w-3 h-3" /> Slack
                    </Badge>
                  )}
                  {p.discordWebhookUrl && (
                    <Badge variant="outline" className="text-xs gap-1">
                      <Globe className="w-3 h-3" /> Discord
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground/60">
                  Created {format(new Date(p.createdAt), "MMM d, yyyy")}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-border/50 border-dashed">
          <CardContent className="py-16 text-center">
            <FolderKanban className="w-12 h-12 mx-auto mb-3 text-muted-foreground/20" />
            <p className="text-muted-foreground font-medium">No projects yet</p>
            <p className="text-sm text-muted-foreground/60 mt-1">Create a project to organise your analyses and set up webhook notifications.</p>
            <Button className="mt-4" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-2" /> Create First Project
            </Button>
          </CardContent>
        </Card>
      )}

      <ProjectFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        initial={emptyForm}
        title="Create Project"
        onSave={f => create.mutate({ name: f.name, description: f.description || undefined, defaultFramework: f.defaultFramework || undefined, slackWebhookUrl: f.slackWebhookUrl || undefined, discordWebhookUrl: f.discordWebhookUrl || undefined })}
      />

      {editTarget && (
        <ProjectFormDialog
          open={!!editTarget}
          onOpenChange={v => { if (!v) setEditTarget(null); }}
          initial={{
            name: editTarget.name,
            description: editTarget.description ?? "",
            defaultFramework: editTarget.defaultFramework ?? "",
            slackWebhookUrl: editTarget.slackWebhookUrl ?? "",
            discordWebhookUrl: editTarget.discordWebhookUrl ?? "",
          }}
          title="Edit Project"
          onSave={f => {
            update.mutate({ id: editTarget.id, body: { name: f.name, description: f.description || undefined, defaultFramework: f.defaultFramework || undefined, slackWebhookUrl: f.slackWebhookUrl || undefined, discordWebhookUrl: f.discordWebhookUrl || undefined } });
            setEditTarget(null);
          }}
        />
      )}
    </div>
  );
}
