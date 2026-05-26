import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, projectsTable, insertProjectSchema } from "@workspace/db";
import { logger } from "../lib/logger";
import { z } from "zod";

const router: IRouter = Router();

const ProjectIdParam = z.object({ id: z.coerce.number().int().positive() });

const UpdateProjectBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  defaultFramework: z.string().optional(),
  slackWebhookUrl: z.string().url().or(z.literal("")).optional(),
  discordWebhookUrl: z.string().url().or(z.literal("")).optional(),
});

// GET /projects
router.get("/projects", async (_req, res): Promise<void> => {
  const projects = await db.select().from(projectsTable).orderBy(projectsTable.createdAt);
  res.json(projects);
});

// POST /projects
router.post("/projects", async (req, res): Promise<void> => {
  const parsed = insertProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [project] = await db.insert(projectsTable).values(parsed.data).returning();
  logger.info({ projectId: project.id }, "Project created");
  res.status(201).json(project);
});

// GET /projects/:id
router.get("/projects/:id", async (req, res): Promise<void> => {
  const params = ProjectIdParam.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, params.data.id));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(project);
});

// PATCH /projects/:id
router.patch("/projects/:id", async (req, res): Promise<void> => {
  const params = ProjectIdParam.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }
  const parsed = UpdateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name != null) updates.name = parsed.data.name;
  if (parsed.data.description != null) updates.description = parsed.data.description;
  if (parsed.data.defaultFramework != null) updates.defaultFramework = parsed.data.defaultFramework;
  if ("slackWebhookUrl" in parsed.data) updates.slackWebhookUrl = parsed.data.slackWebhookUrl || null;
  if ("discordWebhookUrl" in parsed.data) updates.discordWebhookUrl = parsed.data.discordWebhookUrl || null;

  const [project] = await db.update(projectsTable).set(updates).where(eq(projectsTable.id, params.data.id)).returning();
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(project);
});

// DELETE /projects/:id
router.delete("/projects/:id", async (req, res): Promise<void> => {
  const params = ProjectIdParam.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }
  const [deleted] = await db.delete(projectsTable).where(eq(projectsTable.id, params.data.id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
