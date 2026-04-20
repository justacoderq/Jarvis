import OpenAI from "openai";
import { SYSTEM_PROMPT, NOTIFICATION_TRIAGE_PROMPT } from "./system-prompt.js";
import {
  toolDefs, toolImplementations, UI_TOOLS,
  ACTION_TOOLS_WITH_AUTO_DUMP, AUTO_DUMP_DELAY, invalidateDumpCache,
} from "./tools/index.js";
import { deviceLock } from "./services/device-lock.js";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG = {
  provider: (process.env.SIRI2_PROVIDER || "openai").toLowerCase(),
  model: process.env.SIRI2_MODEL || process.env.AGENT_MODEL || "gpt-4.1-mini",
  maxTokens: parseInt(process.env.MAX_TOKENS || "8192"),
  maxToolTurns: parseInt(process.env.MAX_TOOL_TURNS || "300"),
  sessionDir: process.env.SESSION_DIR || join(homedir(), ".siri2"),
};

function getProviderConfig(provider: string): { apiKey: string; baseURL?: string } {
  switch (provider) {
    case "openai":
      return { apiKey: process.env.OPENAI_API_KEY || "" };
    case "xai":
      return {
        apiKey: process.env.XAI_API_KEY || "",
        baseURL: "https://api.x.ai/v1",
      };
    case "groq":
      return {
        apiKey: process.env.GROQ_API_KEY || "",
        baseURL: "https://api.groq.com/openai/v1",
      };
    case "cerebras":
      return {
        apiKey: process.env.CEREBRAS_API_KEY || "",
        baseURL: "https://api.cerebras.ai/v1",
      };
    default:
      throw new Error(`Unsupported SIRI2_PROVIDER "${provider}"`);
  }
}

const providerConfig = getProviderConfig(CONFIG.provider);
const client = new OpenAI({
  apiKey: providerConfig.apiKey,
  baseURL: providerConfig.baseURL,
});

if (!existsSync(CONFIG.sessionDir)) {
  mkdirSync(CONFIG.sessionDir, { recursive: true });
}

let messages: any[] = [];
let consecutiveErrors = 0;

function truncate(str: string, max = 65536): string {
  if (str.length <= max) return str;
  const half = Math.floor(max / 2) - 50;
  return (
    str.slice(0, half) +
    `\n\n... [truncated ${str.length - max} bytes] ...\n\n` +
    str.slice(-half)
  );
}

function toOpenAITools() {
  return toolDefs.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  }));
}

function toOpenAIMessages(history: any[]) {
  const openAIMessages: any[] = [];

  for (const msg of history) {
    if (typeof msg.content === "string") {
      openAIMessages.push({ role: msg.role, content: msg.content });
      continue;
    }

    if (msg.role === "assistant") {
      const textParts = (msg.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text);
      const toolCalls = (msg.content || [])
        .filter((b: any) => b.type === "tool_use")
        .map((b: any) => ({
          id: b.id,
          type: "function",
          function: {
            name: b.name,
            arguments: JSON.stringify(b.input || {}),
          },
        }));

      openAIMessages.push({
        role: "assistant",
        content: textParts.join("\n") || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
      continue;
    }

    if (msg.role === "user" && Array.isArray(msg.content)) {
      const textParts = msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text);
      const toolResults = msg.content.filter((b: any) => b.type === "tool_result");

      if (textParts.length > 0) {
        openAIMessages.push({ role: "user", content: textParts.join("\n") });
      }

      for (const result of toolResults) {
        openAIMessages.push({
          role: "tool",
          tool_call_id: result.tool_use_id,
          content: typeof result.content === "string" ? result.content : JSON.stringify(result.content),
        });
      }
      continue;
    }
  }

  return openAIMessages;
}

function completionToBlocks(message: any) {
  const blocks: any[] = [];
  if (message?.content) {
    blocks.push({ type: "text", text: message.content });
  }
  for (const call of message?.tool_calls || []) {
    let input = {};
    try {
      input = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
    } catch {
      input = {};
    }
    blocks.push({
      type: "tool_use",
      id: call.id,
      name: call.function.name,
      input,
    });
  }
  return blocks;
}

export interface AgentResult {
  text: string;
  turns: number;
}

export interface AgentOptions {
  agentId?: string;
}

export async function runAgent(userText: string, options?: AgentOptions): Promise<AgentResult> {
  const agentId = options?.agentId;
  if (consecutiveErrors >= 2) {
    console.log("\x1b[33m! Auto-clearing history after repeated errors.\x1b[0m");
    messages.length = 0;
    consecutiveErrors = 0;
  }

  messages.push({ role: "user", content: userText });
  const historyLenAtStart = messages.length;
  let turnCount = 0;
  let lastText = "";

  while (true) {
    turnCount++;

    let response;
    try {
      response = await client.chat.completions.create({
        model: CONFIG.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...toOpenAIMessages(messages),
        ],
        tools: toOpenAITools(),
        tool_choice: "auto",
        max_tokens: CONFIG.maxTokens,
      });
    } catch (err: any) {
      const errMsg = err.error?.message || err.message || String(err);
      console.error(`\n\x1b[31mAPI error: ${errMsg}\x1b[0m`);
      consecutiveErrors++;
      messages.length = historyLenAtStart;
      return { text: `Error: ${errMsg}`, turns: turnCount };
    }

    const assistantMessage = response.choices[0]?.message;
    const contentBlocks = completionToBlocks(assistantMessage);
    const textBlock = contentBlocks.find((b) => b.type === "text");
    if (textBlock?.text) {
      process.stdout.write(textBlock.text);
      lastText = textBlock.text;
    }

    if (contentBlocks.length > 0) {
      messages.push({ role: "assistant", content: contentBlocks });
    }

    const toolUses = contentBlocks.filter((b) => b.type === "tool_use");
    if (toolUses.length === 0) {
      consecutiveErrors = 0;
      break;
    }

    if (turnCount >= CONFIG.maxToolTurns) {
      return { text: lastText || "Tool call limit reached.", turns: turnCount };
    }

    const toolResults: any[] = [];
    for (const block of toolUses) {
      const impl = toolImplementations[block.name];
      if (!impl) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify({ error: `Unknown tool: ${block.name}` }),
          is_error: true,
        });
        continue;
      }

      if (agentId && UI_TOOLS.has(block.name) && deviceLock.isLocked() && !deviceLock.isLockedBy(agentId)) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify({ error: "Device is locked by another owner. Wrap up your work." }),
          is_error: true,
        });
        console.log(`\x1b[33m  blocked (device locked)\x1b[0m`);
        continue;
      }

      try {
        process.stdout.write(`\n\x1b[36m> ${block.name}\x1b[0m`);
        const result = await impl(block.input);
        let resultStr = typeof result === "string" ? result : JSON.stringify(result);

        if (ACTION_TOOLS_WITH_AUTO_DUMP.has(block.name)) {
          const delay = AUTO_DUMP_DELAY[block.name] || 200;
          await new Promise((r) => setTimeout(r, delay));
          invalidateDumpCache();
          try {
            const autoDumpImpl = toolImplementations["dump_ui_tree"];
            const dumpResult = await autoDumpImpl({});
            const combined = {
              action: JSON.parse(resultStr),
              autoDump: JSON.parse(dumpResult),
            };
            resultStr = JSON.stringify(combined);
            process.stdout.write(`\r\x1b[K  \x1b[32mok\x1b[0m + auto-dump\n`);
          } catch {
            process.stdout.write(`\r\x1b[K  \x1b[32mok\x1b[0m\n`);
          }
        } else {
          process.stdout.write(`\r\x1b[K  \x1b[32mok\x1b[0m\n`);
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: truncate(resultStr),
        });
        if (agentId) deviceLock.refresh(agentId);
      } catch (err: any) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify({ error: err.message }),
          is_error: true,
        });
        console.error(`\x1b[31m  ${block.name} error: ${err.message}\x1b[0m`);
      }
    }

    messages.push({ role: "user", content: toolResults });
  }

  return { text: lastText, turns: turnCount };
}

export interface TriageResult {
  action: "ignore" | "log" | "alert" | "act";
  reason: string;
}

export async function runTriageAgent(notification: {
  packageName: string;
  title: string;
  text: string;
  actions: string[];
}): Promise<TriageResult> {
  try {
    const response = await client.chat.completions.create({
      model: CONFIG.model,
      messages: [
        { role: "system", content: NOTIFICATION_TRIAGE_PROMPT },
        {
          role: "user",
          content: `New notification received:\n\nApp: ${notification.packageName}\nTitle: ${notification.title}\nText: ${notification.text}\nActions: ${notification.actions.join(", ") || "none"}\n\nDecide what to do with this notification.`,
        },
      ],
      tools: toOpenAITools(),
      tool_choice: "auto",
      max_tokens: 2048,
    });

    const message = response.choices[0]?.message;
    const text = message?.content || "";
    const lower = text.toLowerCase();
    if (lower.includes("act")) return { action: "act", reason: text };
    if (lower.includes("alert")) return { action: "alert", reason: text };
    if (lower.includes("log")) return { action: "log", reason: text };
    return { action: "ignore", reason: text };
  } catch (err: any) {
    return { action: "ignore", reason: `API error: ${err.message}` };
  }
}

export function saveSession(name = "last"): string {
  const data = { messages, savedAt: new Date().toISOString() };
  const path = join(CONFIG.sessionDir, `session-${name}.json`);
  writeFileSync(path, JSON.stringify(data), "utf-8");
  return path;
}

export function loadSession(name = "last"): boolean {
  const path = join(CONFIG.sessionDir, `session-${name}.json`);
  if (!existsSync(path)) return false;
  try {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    messages = data.messages || [];
    return true;
  } catch {
    return false;
  }
}

export function clearHistory(): void {
  messages = [];
}
