import OpenAI from "openai";

const usingDirectKey = !!process.env.OPENAI_API_KEY;

if (!usingDirectKey) {
  if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL) {
    throw new Error(
      "Either OPENAI_API_KEY or AI_INTEGRATIONS_OPENAI_BASE_URL must be set.",
    );
  }
  if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    throw new Error(
      "Either OPENAI_API_KEY or AI_INTEGRATIONS_OPENAI_API_KEY must be set.",
    );
  }
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  ...(usingDirectKey ? {} : { baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL }),
});
