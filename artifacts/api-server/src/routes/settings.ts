import { Router, type IRouter } from "express";
import { getLLMConfigPublic, setLLMConfig, invalidateClient, testLLMConnection, PROVIDER_PRESETS, type LLMProvider } from "../lib/llmConfig";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const VALID_PROVIDERS: LLMProvider[] = ["groq", "openai", "ollama", "custom"];

// GET /settings/llm — returns current config (API key masked)
router.get("/settings/llm", (_req, res): void => {
  try {
    const config = getLLMConfigPublic();
    res.json({
      ...config,
      presets: PROVIDER_PRESETS,
    });
  } catch (err) {
    logger.error({ err }, "settings get error");
    res.status(500).json({ error: "Failed to load settings" });
  }
});

// POST /settings/llm — saves new config
router.post("/settings/llm", (req, res): void => {
  const { provider, apiKey, baseURL, model } = req.body as {
    provider?: string;
    apiKey?: string;
    baseURL?: string;
    model?: string;
  };

  if (!provider || !VALID_PROVIDERS.includes(provider as LLMProvider)) {
    res.status(400).json({ error: `provider must be one of: ${VALID_PROVIDERS.join(", ")}` });
    return;
  }

  if (provider !== "ollama" && !apiKey?.trim()) {
    res.status(400).json({ error: "apiKey is required for non-Ollama providers" });
    return;
  }

  if (!model?.trim()) {
    res.status(400).json({ error: "model is required" });
    return;
  }

  const resolvedBaseURL = baseURL?.trim() || PROVIDER_PRESETS[provider as LLMProvider]?.baseURL || "";

  setLLMConfig({
    provider: provider as LLMProvider,
    apiKey: apiKey?.trim() ?? "",
    baseURL: resolvedBaseURL,
    model: model.trim(),
    useEnvConfig: false,
  });

  logger.info({ provider, model }, "LLM config updated");
  res.json({ ok: true, config: getLLMConfigPublic() });
});

// POST /settings/llm/reset — revert to env-based config
router.post("/settings/llm/reset", (_req, res): void => {
  invalidateClient();
  // Remove stored file so env vars take precedence again
  import("fs").then(fs => {
    import("path").then(path => {
      const cfgPath = path.join(process.cwd(), ".llm-config.json");
      try { if (fs.existsSync(cfgPath)) fs.unlinkSync(cfgPath); } catch {}
    });
  });
  res.json({ ok: true, config: getLLMConfigPublic() });
});

// POST /settings/llm/test — tests the active connection
router.post("/settings/llm/test", async (_req, res): Promise<void> => {
  try {
    const result = await testLLMConnection();
    res.json(result);
  } catch (err) {
    logger.error({ err }, "LLM connection test error");
    res.status(500).json({ ok: false, error: String((err as Error).message), latencyMs: 0, model: "" });
  }
});

export default router;
