import OpenAI from "openai";

const groqKey  = process.env.GROQ_API_KEY;
const directKey = process.env.OPENAI_API_KEY;
const proxyKey  = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
const proxyUrl  = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

if (!groqKey && !directKey && !proxyKey) {
  throw new Error(
    "No AI provider key found. Set GROQ_API_KEY, OPENAI_API_KEY, or provision the OpenAI AI integration.",
  );
}

export const openai = groqKey
  ? new OpenAI({
      apiKey: groqKey,
      baseURL: "https://api.groq.com/openai/v1",
    })
  : new OpenAI({
      apiKey: directKey ?? proxyKey,
      ...(directKey ? {} : { baseURL: proxyUrl }),
    });
