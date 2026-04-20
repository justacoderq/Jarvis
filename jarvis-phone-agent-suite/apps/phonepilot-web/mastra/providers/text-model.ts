import { createOpenAI, openai } from "@ai-sdk/openai";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required when using the configured provider`);
  }
  return value;
}

function createCompatibleProvider(providerName: string) {
  switch (providerName) {
    case "openai":
      return openai;
    case "xai":
      return createOpenAI({
        name: "xai",
        apiKey: requireEnv("XAI_API_KEY"),
        baseURL: "https://api.x.ai/v1",
      });
    case "groq":
      return createOpenAI({
        name: "groq",
        apiKey: requireEnv("GROQ_API_KEY"),
        baseURL: "https://api.groq.com/openai/v1",
      });
    case "cerebras":
      return createOpenAI({
        name: "cerebras",
        apiKey: requireEnv("CEREBRAS_API_KEY"),
        baseURL: "https://api.cerebras.ai/v1",
      });
    default:
      throw new Error(
        `Unsupported PHONEPILOT_TEXT_PROVIDER "${providerName}". Use openai, xai, groq, or cerebras.`,
      );
  }
}

export function getPhonePilotTextModel() {
  const providerName = (process.env.PHONEPILOT_TEXT_PROVIDER || "openai").toLowerCase();
  const modelName = process.env.PHONEPILOT_TEXT_MODEL || "gpt-4.1-mini";
  return createCompatibleProvider(providerName)(modelName);
}
