import { Router, type IRouter } from "express";
import { runEnvDiff, runNl2Test, runFlakyDetector, runRegressionGuard, runImageAnalyze, runBugDigest } from "../lib/agents";
import { runCodeInSandbox } from "../lib/codeRunner";
import { logger } from "../lib/logger";
import { db, analysesTable } from "@workspace/db";
import { gte } from "drizzle-orm";

const router: IRouter = Router();

function parseJson(raw: string): unknown {
  // 1. strip markdown fences
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) raw = fenced[1];

  // 2. try direct parse
  try { return JSON.parse(raw.trim()); } catch {}

  // 3. extract first {...} or [...] block
  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch {} }
  const arrMatch = raw.match(/\[[\s\S]*\]/);
  if (arrMatch) { try { return JSON.parse(arrMatch[0]); } catch {} }

  // 4. nothing worked
  throw new SyntaxError("No valid JSON found in response");
}

// POST /tools/env-diff
router.post("/tools/env-diff", async (req, res): Promise<void> => {
  const { env1, env2, bugDescription, label1, label2 } = req.body as {
    env1?: string; env2?: string; bugDescription?: string; label1?: string; label2?: string;
  };

  if (!env1?.trim() || !env2?.trim() || !bugDescription?.trim()) {
    res.status(400).json({ error: "env1, env2, and bugDescription are required" });
    return;
  }

  try {
    const raw = await runEnvDiff(env1, env2, bugDescription, label1 || "Environment A", label2 || "Environment B");
    const result = parseJson(raw);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "env-diff error");
    res.status(500).json({ error: "Failed to analyze environment differences. Try again." });
  }
});

// POST /tools/nl2test
router.post("/tools/nl2test", async (req, res): Promise<void> => {
  const { description, framework, codeContext } = req.body as {
    description?: string; framework?: string; codeContext?: string;
  };

  if (!description?.trim()) {
    res.status(400).json({ error: "description is required" });
    return;
  }

  try {
    const raw = await runNl2Test(description, framework ?? "", codeContext);
    const result = parseJson(raw) as Record<string, unknown>;

    // Normalise fields so client always gets a consistent shape
    res.json({
      testCode: String(result.testCode ?? result.test_code ?? ""),
      framework: String(result.framework ?? framework ?? "Jest"),
      explanation: String(result.explanation ?? ""),
      coverageNotes: String(result.coverageNotes ?? result.coverage_notes ?? ""),
    });
  } catch (err) {
    logger.error({ err }, "nl2test error");
    res.status(500).json({ error: "Failed to generate test case. Try again." });
  }
});

// POST /tools/flaky-detector
router.post("/tools/flaky-detector", async (req, res): Promise<void> => {
  const { testCode, language } = req.body as { testCode?: string; language?: string };

  if (!testCode?.trim()) {
    res.status(400).json({ error: "testCode is required" });
    return;
  }

  try {
    const raw = await runFlakyDetector(testCode, language ?? "");
    const result = parseJson(raw) as Record<string, unknown>;

    // Normalise
    res.json({
      flakyTests: Array.isArray(result.flakyTests) ? result.flakyTests : [],
      overallRisk: String(result.overallRisk ?? result.overall_risk ?? "none"),
      summary: String(result.summary ?? ""),
    });
  } catch (err) {
    logger.error({ err }, "flaky-detector error");
    res.status(500).json({ error: "Failed to detect flaky tests. Try again." });
  }
});

// POST /tools/regression-guard
router.post("/tools/regression-guard", async (req, res): Promise<void> => {
  const { testCode, codeChanges, bugDescription } = req.body as {
    testCode?: string; codeChanges?: string; bugDescription?: string;
  };

  if (!testCode?.trim() || !codeChanges?.trim() || !bugDescription?.trim()) {
    res.status(400).json({ error: "testCode, codeChanges, and bugDescription are all required" });
    return;
  }

  try {
    const raw = await runRegressionGuard(testCode, codeChanges, bugDescription);
    const result = parseJson(raw) as Record<string, unknown>;
    res.json({
      verdict: String(result.verdict ?? "uncertain"),
      confidence: String(result.confidence ?? "low"),
      reasoning: String(result.reasoning ?? ""),
      criticalLines: Array.isArray(result.criticalLines) ? result.criticalLines : [],
      missedScenarios: Array.isArray(result.missedScenarios) ? result.missedScenarios : [],
      recommendation: String(result.recommendation ?? ""),
    });
  } catch (err) {
    logger.error({ err }, "regression-guard error");
    res.status(500).json({ error: "Failed to analyze regression coverage. Try again." });
  }
});

// POST /tools/image-analyze
router.post("/tools/image-analyze", async (req, res): Promise<void> => {
  const { imageDescription, additionalContext } = req.body as {
    imageDescription?: string; additionalContext?: string;
  };

  if (!imageDescription?.trim()) {
    res.status(400).json({ error: "imageDescription is required" });
    return;
  }

  try {
    const raw = await runImageAnalyze(imageDescription, additionalContext);
    const result = parseJson(raw) as Record<string, unknown>;
    res.json({
      extractedText: String(result.extractedText ?? ""),
      uiState: String(result.uiState ?? ""),
      visibleErrors: Array.isArray(result.visibleErrors) ? result.visibleErrors : [],
      suggestedBugReport: String(result.suggestedBugReport ?? ""),
      inputType: String(result.inputType ?? "raw_text"),
      confidence: String(result.confidence ?? "low"),
    });
  } catch (err) {
    logger.error({ err }, "image-analyze error");
    res.status(500).json({ error: "Failed to analyze screenshot description. Try again." });
  }
});

// POST /tools/bug-digest
router.post("/tools/bug-digest", async (req, res): Promise<void> => {
  const { period = "last_7_days" } = req.body as { period?: string };

  const periodDays: Record<string, number> = {
    today: 1,
    last_7_days: 7,
    last_30_days: 30,
    all_time: 3650,
  };
  const days = periodDays[period] ?? 7;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  try {
    const analyses = await db
      .select({
        id: analysesTable.id,
        title: analysesTable.title,
        severity: analysesTable.severity,
        status: analysesTable.status,
        inputType: analysesTable.inputType,
        confidenceScore: analysesTable.confidenceScore,
        createdAt: analysesTable.createdAt,
        autoTags: analysesTable.autoTags,
      })
      .from(analysesTable)
      .where(gte(analysesTable.createdAt, cutoff))
      .orderBy(analysesTable.createdAt);

    if (analyses.length === 0) {
      res.json({
        summary: `No bugs were analysed during ${period.replace(/_/g, " ")}.`,
        highlights: [],
        patterns: [],
        recommendations: ["Submit your first bug report to start tracking patterns"],
        topComponents: [],
        riskLevel: "low",
        statsNote: "0 analyses in this period.",
      });
      return;
    }

    const raw = await runBugDigest(analyses, period.replace(/_/g, " "));
    const result = parseJson(raw) as Record<string, unknown>;
    res.json({
      summary: String(result.summary ?? ""),
      highlights: Array.isArray(result.highlights) ? result.highlights : [],
      patterns: Array.isArray(result.patterns) ? result.patterns : [],
      recommendations: Array.isArray(result.recommendations) ? result.recommendations : [],
      topComponents: Array.isArray(result.topComponents) ? result.topComponents : [],
      riskLevel: String(result.riskLevel ?? "low"),
      statsNote: String(result.statsNote ?? ""),
    });
  } catch (err) {
    logger.error({ err }, "bug-digest error");
    res.status(500).json({ error: "Failed to generate bug digest. Try again." });
  }
});

// POST /tools/run-code — sandbox code runner
router.post("/tools/run-code", async (req, res): Promise<void> => {
  const { code, language } = req.body as { code?: string; language?: string };

  if (!code?.trim()) {
    res.status(400).json({ error: "code is required" });
    return;
  }

  if (code.length > 50_000) {
    res.status(400).json({ error: "Code too large (max 50 KB)" });
    return;
  }

  try {
    const result = await runCodeInSandbox(code, language ?? "JavaScript");
    res.json(result);
  } catch (err) {
    logger.error({ err }, "run-code error");
    res.status(500).json({ error: "Sandbox execution failed" });
  }
});

export default router;
