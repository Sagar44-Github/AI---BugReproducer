import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { logger } from "./logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export type LLMProvider = "groq" | "openai" | "ollama" | "custom";

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  baseURL: string;
  model: string;
  /** Whether to use env-based config rather than stored config */
  useEnvConfig: boolean;
}

export interface LLMConfigPublic {
  provider: LLMProvider;
  apiKeySet: boolean;
  apiKeyPreview: string;
  baseURL: string;
  model: string;
  useEnvConfig: boolean;
  envSource: string | null;
}

// ─── Provider presets ─────────────────────────────────────────────────────────

export const PROVIDER_PRESETS: Record<LLMProvider, { baseURL: string; defaultModel: string; label: string }> = {
  groq: {
    baseURL: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    label: "Groq (fast open-source models)",
  },
  openai: {
    baseURL: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    label: "OpenAI (GPT models)",
  },
  ollama: {
    baseURL: "http://localhost:11434/v1",
    defaultModel: "llama3.2",
    label: "Ollama (local models)",
  },
  custom: {
    baseURL: "",
    defaultModel: "",
    label: "Custom (OpenAI-compatible endpoint)",
  },
};

// ─── Persistence ──────────────────────────────────────────────────────────────

const CONFIG_PATH = path.join(process.cwd(), ".llm-config.json");

let _config: LLMConfig | null = null;
let _client: OpenAI | null = null;

function detectEnvConfig(): { config: LLMConfig; source: string } | null {
  const groqKey = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const proxyKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const proxyUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

  if (groqKey) {
    return {
      config: {
        provider: "groq",
        apiKey: groqKey,
        baseURL: "https://api.groq.com/openai/v1",
        model: "llama-3.3-70b-versatile",
        useEnvConfig: true,
      },
      source: "GROQ_API_KEY",
    };
  }
  if (openaiKey) {
    return {
      config: {
        provider: "openai",
        apiKey: openaiKey,
        baseURL: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        useEnvConfig: true,
      },
      source: "OPENAI_API_KEY",
    };
  }
  if (proxyKey && proxyUrl) {
    return {
      config: {
        provider: "custom",
        apiKey: proxyKey,
        baseURL: proxyUrl,
        model: "llama-3.3-70b-versatile",
        useEnvConfig: true,
      },
      source: "AI_INTEGRATIONS_OPENAI_API_KEY",
    };
  }
  return null;
}

export function getLLMConfig(): LLMConfig {
  if (_config) return _config;

  // Try stored config file first
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
      const stored = JSON.parse(raw) as LLMConfig;
      if (!stored.useEnvConfig) {
        _config = stored;
        return _config;
      }
    }
  } catch {
    // ignore, fall through
  }

  // Fall back to env vars
  const env = detectEnvConfig();
  if (env) {
    _config = env.config;
    return _config;
  }

  // Last resort: no-op placeholder (will fail at call time with a clear error)
  _config = {
    provider: "groq",
    apiKey: "",
    baseURL: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    useEnvConfig: false,
  };
  return _config;
}

export function setLLMConfig(config: LLMConfig): void {
  _config = config;
  _client = null; // force client rebuild
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
  } catch (err) {
    logger.warn({ err }, "Failed to persist LLM config to disk");
  }
}

export function getLLMConfigPublic(): LLMConfigPublic {
  const cfg = getLLMConfig();
  const env = detectEnvConfig();
  const apiKeyPreview = cfg.apiKey.length > 8
    ? `${cfg.apiKey.slice(0, 4)}...${cfg.apiKey.slice(-4)}`
    : cfg.apiKey.length > 0
    ? "****"
    : "";
  return {
    provider: cfg.provider,
    apiKeySet: cfg.apiKey.length > 0,
    apiKeyPreview,
    baseURL: cfg.baseURL,
    model: cfg.model,
    useEnvConfig: cfg.useEnvConfig,
    envSource: cfg.useEnvConfig && env ? env.source : null,
  };
}

// ─── Active client ────────────────────────────────────────────────────────────

export function getActiveClient(): OpenAI {
  if (_client) return _client;
  const config = getLLMConfig();

  if (!config.apiKey && config.provider !== "ollama") {
    throw new Error(
      "No AI provider API key configured. Go to Settings → AI Provider to set your API key, or set GROQ_API_KEY / OPENAI_API_KEY environment variable."
    );
  }

  const baseURL = config.baseURL || PROVIDER_PRESETS[config.provider]?.baseURL || undefined;
  _client = new OpenAI({
    apiKey: config.provider === "ollama" ? "ollama" : config.apiKey,
    ...(baseURL ? { baseURL } : {}),
  });
  return _client;
}

export function getActiveModel(): string {
  return getLLMConfig().model || PROVIDER_PRESETS[getLLMConfig().provider]?.defaultModel || "llama-3.3-70b-versatile";
}

/** Call after saving new config to force client rebuild on next request */
export function invalidateClient(): void {
  _config = null;
  _client = null;
}

// ─── Connection test ──────────────────────────────────────────────────────────

export async function testLLMConnection(): Promise<{ ok: boolean; model: string; latencyMs: number; error?: string }> {
  const t0 = Date.now();
  try {
    const client = getActiveClient();
    const model = getActiveModel();
    const resp = await client.chat.completions.create({
      model,
      max_completion_tokens: 10,
      messages: [{ role: "user", content: "Reply with the single word: ok" }],
    });
    const latencyMs = Date.now() - t0;
    const reply = resp.choices[0]?.message?.content ?? "";
    return { ok: true, model, latencyMs, error: reply ? undefined : "Empty response" };
  } catch (err) {
    return { ok: false, model: getActiveModel(), latencyMs: Date.now() - t0, error: String((err as Error).message) };
  }
}
