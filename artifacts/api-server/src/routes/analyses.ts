import { Router, type IRouter } from "express";
import { eq, avg, count, sql } from "drizzle-orm";
import { db, analysesTable } from "@workspace/db";
import {
  CreateAnalysisBody,
  GetAnalysisParams,
  DeleteAnalysisParams,
  RunAnalysisParams,
} from "@workspace/api-zod";
import { runBugReproductionPipeline, type AgentEvent } from "../lib/agents";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// GET /analyses
router.get("/analyses", async (_req, res): Promise<void> => {
  const analyses = await db
    .select()
    .from(analysesTable)
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

  const [analysis] = await db
    .insert(analysesTable)
    .values({
      title: parsed.data.title,
      inputType: parsed.data.inputType,
      rawInput: parsed.data.rawInput,
      githubUrl: parsed.data.githubUrl,
      codeContext: parsed.data.codeContext,
      status: "pending",
    })
    .returning();

  res.status(201).json(analysis);
});

// GET /analyses/stats/summary
router.get("/analyses/stats/summary", async (_req, res): Promise<void> => {
  const [totals] = await db
    .select({
      total: count(),
      completed: count(sql`CASE WHEN status = 'completed' THEN 1 END`),
      running: count(sql`CASE WHEN status = 'running' THEN 1 END`),
      failed: count(sql`CASE WHEN status = 'failed' THEN 1 END`),
      avgConfidence: avg(analysesTable.confidenceScore),
    })
    .from(analysesTable);

  res.json({
    total: Number(totals.total),
    completed: Number(totals.completed),
    running: Number(totals.running),
    failed: Number(totals.failed),
    avgConfidence: totals.avgConfidence ? parseFloat(String(totals.avgConfidence)) : null,
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

  try {
    const result = await runBugReproductionPipeline(
      analysis.rawInput,
      analysis.inputType,
      analysis.codeContext,
      sendEvent
    );

    // Save results to DB
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

    sendEvent({ type: "error", agentName: "System", content: "An error occurred during the pipeline." });
  }

  res.end();
});

export default router;
