import { Router, type IRouter } from "express";
import { runEnvDiff, runNl2Test, runFlakyDetector } from "../lib/agents";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// POST /tools/env-diff
router.post("/tools/env-diff", async (req, res): Promise<void> => {
  const { env1, env2, bugDescription, label1, label2 } = req.body as {
    env1?: string;
    env2?: string;
    bugDescription?: string;
    label1?: string;
    label2?: string;
  };

  if (!env1 || !env2 || !bugDescription) {
    res.status(400).json({ error: "env1, env2, and bugDescription are required" });
    return;
  }

  try {
    const raw = await runEnvDiff(
      env1,
      env2,
      bugDescription,
      label1 || "Environment A",
      label2 || "Environment B"
    );

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(raw);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "env-diff error");
    res.status(500).json({ error: "Failed to analyze environment differences" });
  }
});

// POST /tools/nl2test
router.post("/tools/nl2test", async (req, res): Promise<void> => {
  const { description, framework, codeContext } = req.body as {
    description?: string;
    framework?: string;
    codeContext?: string;
  };

  if (!description) {
    res.status(400).json({ error: "description is required" });
    return;
  }

  try {
    const raw = await runNl2Test(description, framework ?? "", codeContext);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(raw);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "nl2test error");
    res.status(500).json({ error: "Failed to generate test case" });
  }
});

// POST /tools/flaky-detector
router.post("/tools/flaky-detector", async (req, res): Promise<void> => {
  const { testCode, language } = req.body as {
    testCode?: string;
    language?: string;
  };

  if (!testCode) {
    res.status(400).json({ error: "testCode is required" });
    return;
  }

  try {
    const raw = await runFlakyDetector(testCode, language ?? "");
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(raw);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "flaky-detector error");
    res.status(500).json({ error: "Failed to detect flaky tests" });
  }
});

export default router;
