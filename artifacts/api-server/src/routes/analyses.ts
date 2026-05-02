import { Router, type IRouter } from "express";
import { eq, avg, count, sql, ilike, and, ne, type SQL } from "drizzle-orm";
import { db, analysesTable, collaborationAnnotationsTable } from "@workspace/db";
import {
  CreateAnalysisBody,
  GetAnalysisParams,
  DeleteAnalysisParams,
  RunAnalysisParams,
  UpdateAnalysisBody,
} from "@workspace/api-zod";
import { runBugReproductionPipeline, runCorrelation, type AgentEvent } from "../lib/agents";
import { AgentValidationError } from "../lib/agentSchemas";
import { logger } from "../lib/logger";
import type { Response } from "express";

const router: IRouter = Router();

// In-memory SSE clients for collaboration
const collaborationClients = new Map<number, Set<Response>>();

function broadcastToRoom(analysisId: number, data: unknown) {
  const clients = collaborationClients.get(analysisId);
  if (!clients) return;
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    res.write(msg);
  }
}

// GET /analyses
router.get("/analyses", async (req, res): Promise<void> => {
  const { status, inputType, search } = req.query as {
    status?: string;
    inputType?: string;
    search?: string;
  };

  const conditions: SQL[] = [];
  if (status) conditions.push(eq(analysesTable.status, status as "pending" | "running" | "completed" | "failed"));
  if (inputType) conditions.push(eq(analysesTable.inputType, inputType as typeof analysesTable.inputType.enumValues[number]));
  if (search) conditions.push(ilike(analysesTable.title, `%${search}%`));

  const analyses = await db
    .select()
    .from(analysesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(analysesTable.createdAt);

  res.json(analyses);
});

// POST /analyses
router.post("/analyses", async (req, res): Promise<void> => {
  const parsed = CreateAnalysisBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { title, rawInput, githubUrl, inputType } = parsed.data;

  if (!title || !title.trim()) {
    res.status(400).json({ error: "Title is required and cannot be empty." });
    return;
  }

  const isGithubType = inputType === "github_url";
  if (isGithubType && !githubUrl?.trim()) {
    res.status(400).json({ error: "A GitHub URL is required for github_url input type." });
    return;
  }
  if (!isGithubType && (!rawInput || !rawInput.trim())) {
    res.status(400).json({ error: "Raw input is required and cannot be empty." });
    return;
  }

  const [analysis] = await db
    .insert(analysesTable)
    .values({
      title: parsed.data.title,
      inputType: parsed.data.inputType,
      rawInput: parsed.data.rawInput,
      githubUrl: parsed.data.githubUrl,
      codeContext: parsed.data.codeContext,
      tags: parsed.data.tags,
      status: "pending",
    })
    .returning();

  res.status(201).json(analysis);
});

// GET /analyses/stats/summary — must be before /:id
router.get("/analyses/stats/summary", async (_req, res): Promise<void> => {
  const [totals] = await db
    .select({
      total: count(),
      completed: count(sql`CASE WHEN status = 'completed' THEN 1 END`),
      running: count(sql`CASE WHEN status = 'running' THEN 1 END`),
      failed: count(sql`CASE WHEN status = 'failed' THEN 1 END`),
      pending: count(sql`CASE WHEN status = 'pending' THEN 1 END`),
      avgConfidence: avg(analysesTable.confidenceScore),
    })
    .from(analysesTable);

  const byInputType = await db
    .select({
      inputType: analysesTable.inputType,
      count: count(),
    })
    .from(analysesTable)
    .groupBy(analysesTable.inputType);

  res.json({
    total: Number(totals.total),
    completed: Number(totals.completed),
    running: Number(totals.running),
    failed: Number(totals.failed),
    pending: Number(totals.pending),
    avgConfidence: totals.avgConfidence ? parseFloat(String(totals.avgConfidence)) : null,
    byInputType: byInputType.map(r => ({ inputType: r.inputType, count: Number(r.count) })),
  });
});

// GET /analyses/:id
router.get("/analyses/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetAnalysisParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [analysis] = await db
    .select()
    .from(analysesTable)
    .where(eq(analysesTable.id, params.data.id));

  if (!analysis) {
    res.status(404).json({ error: "Analysis not found" });
    return;
  }

  res.json(analysis);
});

// PATCH /analyses/:id
router.patch("/analyses/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetAnalysisParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateAnalysisBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.title != null) updates.title = parsed.data.title;
  if (parsed.data.codeContext != null) updates.codeContext = parsed.data.codeContext;
  if (parsed.data.tags != null) updates.tags = parsed.data.tags;

  const [analysis] = await db
    .update(analysesTable)
    .set(updates)
    .where(eq(analysesTable.id, params.data.id))
    .returning();

  if (!analysis) {
    res.status(404).json({ error: "Analysis not found" });
    return;
  }

  res.json(analysis);
});

// DELETE /analyses/:id
router.delete("/analyses/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteAnalysisParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(analysesTable)
    .where(eq(analysesTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Analysis not found" });
    return;
  }

  res.sendStatus(204);
});

// GET /analyses/:id/export
router.get("/analyses/:id/export", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetAnalysisParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [analysis] = await db
    .select()
    .from(analysesTable)
    .where(eq(analysesTable.id, params.data.id));

  if (!analysis) {
    res.status(404).json({ error: "Analysis not found" });
    return;
  }

  const inputTypeLabel: Record<string, string> = {
    raw_text: "Raw Text",
    github_url: "GitHub Issue",
    stack_trace: "Stack Trace",
    jira_ticket: "Jira Ticket",
    sentry_event: "Sentry Event",
    log_file: "Log File",
    curl_request: "curl / API Request",
    video_description: "Video / Screen Recording",
  };

  const severitySection = analysis.severity
    ? `**Severity:** ${analysis.severity.toUpperCase()} — ${analysis.severityReason ?? ""}\n`
    : "";

  const md = `# Bug Report: ${analysis.title}

**Source Type:** ${inputTypeLabel[analysis.inputType] ?? analysis.inputType}
**Status:** ${analysis.status}
**Confidence:** ${analysis.confidenceScore != null ? `${Math.round(analysis.confidenceScore * 100)}%` : "N/A"}
${severitySection}**Created:** ${analysis.createdAt.toISOString()}
${analysis.tags ? `**Tags:** ${analysis.tags}` : ""}

---

## Original Input

\`\`\`
${analysis.rawInput}
\`\`\`

${analysis.codeContext ? `## Code Context\n\n\`\`\`\n${analysis.codeContext}\n\`\`\`\n` : ""}

---

## Extracted Entities

${analysis.extractedEntities ?? "_Not yet analysed_"}

---

## Hypotheses

${analysis.hypotheses ?? "_Not yet analysed_"}

---

## Reproduction Steps

${analysis.reproductionSteps ?? "_Not yet analysed_"}

---

## Test Code

\`\`\`typescript
${analysis.testCode ?? "// Not yet generated"}
\`\`\`

---

## Analysis & Flow

${analysis.flowDiagram ?? "_Not yet analysed_"}

---

*Generated by Bug Reproduction Engine — ${new Date().toISOString()}*
`;

  res.json({ markdown: md, title: analysis.title });
});

// GET /analyses/:id/correlations
router.get("/analyses/:id/correlations", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetAnalysisParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [target] = await db
    .select()
    .from(analysesTable)
    .where(eq(analysesTable.id, params.data.id));

  if (!target) {
    res.status(404).json({ error: "Analysis not found" });
    return;
  }

  // Return cached correlations if available
  if (target.correlations) {
    try {
      res.json(JSON.parse(target.correlations));
      return;
    } catch {
      // fall through to recompute
    }
  }

  // Fetch completed analyses excluding this one
  const candidates = await db
    .select({
      id: analysesTable.id,
      title: analysesTable.title,
      rawInput: analysesTable.rawInput,
      extractedEntities: analysesTable.extractedEntities,
      createdAt: analysesTable.createdAt,
    })
    .from(analysesTable)
    .where(and(
      ne(analysesTable.id, params.data.id),
      eq(analysesTable.status, "completed")
    ))
    .orderBy(analysesTable.createdAt);

  if (candidates.length === 0) {
    res.json([]);
    return;
  }

  try {
    const raw = await runCorrelation(
      target.rawInput,
      target.extractedEntities ?? "",
      candidates
    );

    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    const correlations = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(raw);

    // Cache the result
    await db
      .update(analysesTable)
      .set({ correlations: JSON.stringify(correlations), updatedAt: new Date() })
      .where(eq(analysesTable.id, params.data.id));

    res.json(correlations);
  } catch (err) {
    logger.error({ err }, "Correlation error");
    res.json([]);
  }
});

// GET /analyses/:id/annotations
router.get("/analyses/:id/annotations", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const annotations = await db
    .select()
    .from(collaborationAnnotationsTable)
    .where(eq(collaborationAnnotationsTable.analysisId, id))
    .orderBy(collaborationAnnotationsTable.createdAt);

  res.json(annotations);
});

// POST /analyses/:id/annotations
router.post("/analyses/:id/annotations", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [existing] = await db
    .select({ id: analysesTable.id })
    .from(analysesTable)
    .where(eq(analysesTable.id, id));

  if (!existing) {
    res.status(404).json({ error: "Analysis not found" });
    return;
  }

  const { authorName, type, stepRef, content } = req.body as {
    authorName?: string;
    type?: string;
    stepRef?: string;
    content?: string;
  };

  if (!authorName || !type || !content) {
    res.status(400).json({ error: "authorName, type, and content are required" });
    return;
  }

  const [annotation] = await db
    .insert(collaborationAnnotationsTable)
    .values({
      analysisId: id,
      authorName,
      type: type as "note" | "verified" | "failed" | "question",
      stepRef: stepRef ?? null,
      content,
    })
    .returning();

  // Broadcast to all collaboration clients
  broadcastToRoom(id, { type: "annotation", annotation });

  res.status(201).json(annotation);
});

// GET /analyses/:id/collaborate — SSE for real-time collaboration
router.get("/analyses/:id/collaborate", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  if (!collaborationClients.has(id)) {
    collaborationClients.set(id, new Set());
  }
  collaborationClients.get(id)!.add(res);

  // Send connected count
  const count = collaborationClients.get(id)!.size;
  res.write(`data: ${JSON.stringify({ type: "connected", collaboratorCount: count })}\n\n`);

  // Send heartbeat every 15s
  const heartbeat = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: "heartbeat" })}\n\n`);
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    collaborationClients.get(id)?.delete(res);
    if (collaborationClients.get(id)?.size === 0) {
      collaborationClients.delete(id);
    }
  });
});

// POST /analyses/:id/run — SSE streaming pipeline
router.post("/analyses/:id/run", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = RunAnalysisParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [analysis] = await db
    .select()
    .from(analysesTable)
    .where(eq(analysesTable.id, params.data.id));

  if (!analysis) {
    res.status(404).json({ error: "Analysis not found" });
    return;
  }

  // Set up SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const sendEvent = (event: AgentEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  // Mark as running
  await db
    .update(analysesTable)
    .set({ status: "running", updatedAt: new Date() })
    .where(eq(analysesTable.id, params.data.id));

  // Deterministic pre-check: does any other completed analysis exist in the DB?
  // Used by the confidence scoring rubric for the "similar_bug" factor.
  const priorAnalyses = await db
    .select({ id: analysesTable.id })
    .from(analysesTable)
    .where(
      and(
        ne(analysesTable.id, params.data.id),
        eq(analysesTable.status, "completed")
      )
    )
    .limit(1);
  const hasSimilarBugs = priorAnalyses.length > 0;

  try {
    const result = await runBugReproductionPipeline(
      analysis.rawInput,
      analysis.inputType,
      analysis.codeContext,
      sendEvent,
      hasSimilarBugs
    );

    await db
      .update(analysesTable)
      .set({
        status: "completed",
        extractedEntities: result.extractedEntities,
        hypotheses: result.hypotheses,
        reproductionSteps: result.reproductionSteps,
        testCode: result.testCode,
        flowDiagram: result.flowDiagram,
        clarifyingQuestions: result.clarifyingQuestions,
        confidenceScore: result.confidenceScore,
        confidenceBreakdown: JSON.stringify(result.confidenceBreakdown),
        severity: result.severity,
        severityReason: result.severityReason,
        auditTrail: JSON.stringify(result.auditTrail),
        updatedAt: new Date(),
      })
      .where(eq(analysesTable.id, params.data.id));

    sendEvent({ type: "pipeline_done", agentName: "System", content: "Pipeline completed successfully." });
  } catch (err) {
    logger.error({ err }, "Pipeline error");

    await db
      .update(analysesTable)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(analysesTable.id, params.data.id));

    if (err instanceof AgentValidationError) {
      sendEvent({
        type: "error",
        agentName: err.agent,
        content: JSON.stringify({
          agent: err.agent,
          reason: err.reason,
          rawOutput: err.rawOutput.slice(0, 300),
        }),
      });
    } else {
      sendEvent({
        type: "error",
        agentName: "System",
        content: "An unexpected error occurred during the pipeline.",
      });
    }
  }

  res.end();
});

export default router;
