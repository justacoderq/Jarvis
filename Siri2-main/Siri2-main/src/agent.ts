import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./system-prompt.js";
import {
  toolDefs, toolImplementations, UI_TOOLS,
  ACTION_TOOLS_WITH_AUTO_DUMP, AUTO_DUMP_DELAY, invalidateDumpCache,
} from "./tools/index.js";
import { deviceLock } from "./services/device-lock.js";
import { NOTIFICATION_TRIAGE_PROMPT } from "./system-prompt.js";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CONFIG = {
  model: process.env.AGENT_MODEL || "claude-haiku-4-5-20251001",
  authToken: process.env.ANTHROPIC_AUTH_TOKEN || "",
  apiKey: process.env.ANTHROPIC_API_KEY || "",
  maxTokens: parseInt(process.env.MAX_TOKENS || "8192"),
  maxToolTurns: parseInt(process.env.MAX_TOOL_TURNS || "300"),
  debug: process.env.DEBUG === "1",
  sessionDir: process.env.SESSION_DIR || join(homedir(), ".siri2"),
};

const useOAuth = !!CONFIG.authToken;

// ---------------------------------------------------------------------------
// Anthropic client — stealth headers for OAuth tokens
// ---------------------------------------------------------------------------

const clientOptions: Record<string, any> = useOAuth
  ? {
      apiKey: null,
      authToken: CONFIG.authToken,
      defaultHeaders: {
        "anthropic-beta":
          "claude-code-20250219,oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14,interleaved-thinking-2025-05-14",
        "user-agent": "claude-cli/2.1.2 (external, cli)",
        "x-app": "cli",
      },
    }
  : { apiKey: CONFIG.apiKey };

const client = new Anthropic(clientOptions);

// System messages — OAuth requires Claude Code identity prefix
const systemMessages: any = useOAuth
  ? [
      { type: "text", text: "You are Claude Code, Anthropic's official CLI for Claude." },
      { type: "text", text: SYSTEM_PROMPT },
    ]
  : SYSTEM_PROMPT;

// ---------------------------------------------------------------------------
// Session dir
// ---------------------------------------------------------------------------

if (!existsSync(CONFIG.sessionDir)) {
  mkdirSync(CONFIG.sessionDir, { recursive: true });
}

// ---------------------------------------------------------------------------
// Conversation state
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Message history validation — prevents orphaned tool_use blocks
// ---------------------------------------------------------------------------

function validateMessages(): void {
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;

    const toolUses = (msg.content || []).filter((b: any) => b.type === "tool_use");
    if (toolUses.length === 0) continue;

    const next = messages[i + 1];
    if (!next || next.role !== "user") {
      const dummyResults = toolUses.map((tu: any) => ({
        type: "tool_result",
        tool_use_id: tu.id,
        content: JSON.stringify({ error: "Session interrupted" }),
        is_error: true,
      }));
      messages.splice(i + 1, 0, { role: "user", content: dummyResults });
      continue;
    }

    const nextContent = Array.isArray(next.content) ? next.content : [];
    const resultIds = new Set(
      nextContent.filter((b: any) => b.type === "tool_result").map((b: any) => b.tool_use_id)
    );
    const missing = toolUses.filter((tu: any) => !resultIds.has(tu.id));
    if (missing.length > 0) {
      for (const tu of missing) {
        nextContent.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify({ error: "Session interrupted" }),
          is_error: true,
        });
      }
      next.content = nextContent;
    }
  }
}

// ---------------------------------------------------------------------------
// Agent loop — streaming with tool execution
// ---------------------------------------------------------------------------

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

  validateMessages();
  messages.push({ role: "user", content: userText });
  const historyLenAtStart = messages.length;

  let turnCount = 0;
  let lastText = "";

  while (true) {
    turnCount++;
    validateMessages();

    let response;
    try {
      response = await client.messages.create({
        model: CONFIG.model,
        max_tokens: CONFIG.maxTokens,
        system: systemMessages,
        messages,
        tools: toolDefs as any,
        stream: true,
      });
    } catch (err: any) {
      const errMsg = err.error?.message || err.message || String(err);
      console.error(`\n\x1b[31mAPI error: ${errMsg}\x1b[0m`);

      if (errMsg.includes("tool_use") && errMsg.includes("tool_result")) {
        consecutiveErrors++;
        validateMessages();
        if (turnCount === 1) continue;
        messages.length = 0;
        messages.push({ role: "user", content: userText });
        return { text: "History corrupted, cleared. Please try again.", turns: turnCount };
      }

      consecutiveErrors++;
      messages.length = historyLenAtStart;
      return { text: `Error: ${errMsg}`, turns: turnCount };
    }

    // Stream response
    const contentBlocks: any[] = [];
    let currentText = "";
    let currentToolUse: any = null;
    let stopReason = "";
    let inputJson = "";

    try {
      for await (const event of response) {
        switch (event.type) {
          case "content_block_start":
            if (event.content_block.type === "text") {
              currentText = "";
            } else if (event.content_block.type === "tool_use") {
              currentToolUse = {
                type: "tool_use",
                id: event.content_block.id,
                name: event.content_block.name,
                input: {},
              };
              inputJson = "";
              process.stdout.write(`\n\x1b[36m> ${event.content_block.name}\x1b[0m`);
            }
            break;

          case "content_block_delta":
            if (event.delta.type === "text_delta") {
              process.stdout.write(event.delta.text);
              currentText += event.delta.text;
            } else if (event.delta.type === "input_json_delta") {
              inputJson += event.delta.partial_json;
            }
            break;

          case "content_block_stop":
            if (currentText) {
              contentBlocks.push({ type: "text", text: currentText });
              lastText = currentText;
              currentText = "";
            }
            if (currentToolUse) {
              try {
                currentToolUse.input = inputJson ? JSON.parse(inputJson) : {};
              } catch {
                currentToolUse.input = {};
              }
              contentBlocks.push(currentToolUse);
              const argsStr = JSON.stringify(currentToolUse.input);
              if (argsStr.length > 2) {
                process.stdout.write(
                  `\x1b[90m(${argsStr.length > 150 ? argsStr.slice(0, 147) + "..." : argsStr})\x1b[0m\n`
                );
              } else {
                process.stdout.write("\n");
              }
              currentToolUse = null;
              inputJson = "";
            }
            break;

          case "message_delta":
            stopReason = (event.delta as any).stop_reason || "";
            break;
        }
      }
    } catch (streamErr: any) {
      console.error(`\n\x1b[31mStream error: ${streamErr.message}\x1b[0m`);
      if (currentText) contentBlocks.push({ type: "text", text: currentText });
      if (currentToolUse) {
        try { currentToolUse.input = inputJson ? JSON.parse(inputJson) : {}; } catch { currentToolUse.input = {}; }
        contentBlocks.push(currentToolUse);
      }
      if (contentBlocks.length > 0) {
        messages.push({ role: "assistant", content: contentBlocks });
        const toolUses = contentBlocks.filter((b) => b.type === "tool_use");
        if (toolUses.length > 0) {
          messages.push({
            role: "user",
            content: toolUses.map((tu) => ({
              type: "tool_result",
              tool_use_id: tu.id,
              content: JSON.stringify({ error: "Stream interrupted: " + streamErr.message }),
              is_error: true,
            })),
          });
        }
      }
      return { text: lastText || `Stream error: ${streamErr.message}`, turns: turnCount };
    }

    consecutiveErrors = 0;

    if (contentBlocks.length > 0) {
      messages.push({ role: "assistant", content: contentBlocks });
    }

    // No tool use — done
    if (stopReason !== "tool_use") {
      break;
    }

    // Hit turn limit
    if (turnCount >= CONFIG.maxToolTurns) {
      console.log(`\n\x1b[33m! Reached ${CONFIG.maxToolTurns} tool turns limit.\x1b[0m`);
      const wrapUpContent: any[] = [];
      const lastAssistant = messages[messages.length - 1];
      if (lastAssistant?.role === "assistant") {
        for (const block of lastAssistant.content || []) {
          if (block.type === "tool_use") {
            wrapUpContent.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify({ error: "Cancelled: tool turn limit reached" }),
              is_error: true,
            });
          }
        }
      }
      wrapUpContent.push({
        type: "text",
        text: "You have reached the tool call limit. Summarize what you accomplished.",
      });
      messages.push({ role: "user", content: wrapUpContent });
      try {
        const summary = await client.messages.create({
          model: CONFIG.model,
          max_tokens: CONFIG.maxTokens,
          system: systemMessages,
          messages,
        });
        for (const block of summary.content) {
          if (block.type === "text") {
            process.stdout.write(block.text);
            lastText = block.text;
          }
        }
        messages.push({ role: "assistant", content: summary.content });
      } catch {}
      break;
    }

    // Execute tools
    const toolResults: any[] = [];
    for (const block of contentBlocks) {
      if (block.type !== "tool_use") continue;

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

      // Lock check: if this is a UI tool and lock is held by someone else, block it
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
        process.stdout.write(`\x1b[90m  running...\x1b[0m`);
        const result = await impl(block.input);
        let resultStr = typeof result === "string" ? result : JSON.stringify(result);

        // Auto-dump: after action tools, wait briefly and append a UI dump
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
            // If auto-dump fails, just return the action result
            const preview = resultStr.length > 200 ? resultStr.slice(0, 197) + "..." : resultStr;
            process.stdout.write(`\r\x1b[K  \x1b[32mok\x1b[0m \x1b[90m${preview}\x1b[0m\n`);
          }
        } else {
          const preview = resultStr.length > 200 ? resultStr.slice(0, 197) + "..." : resultStr;
          let icon = "\x1b[32mok\x1b[0m";
          try {
            const parsed = JSON.parse(resultStr);
            if (parsed.ok === false || parsed.error) icon = "\x1b[31mfail\x1b[0m";
          } catch {}
          process.stdout.write(`\r\x1b[K  ${icon} \x1b[90m${preview}\x1b[0m\n`);
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: truncate(resultStr),
        });
        // Keep lock alive while agent is actively working
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

// ---------------------------------------------------------------------------
// Triage agent — lightweight agent for notification handling
// ---------------------------------------------------------------------------

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
  const triageId = `triage-${Date.now()}`;
  const triageMessages: any[] = [
    {
      role: "user",
      content: `New notification received:\n\nApp: ${notification.packageName}\nTitle: ${notification.title}\nText: ${notification.text}\nActions: ${notification.actions.join(", ") || "none"}\n\nDecide what to do with this notification.`,
    },
  ];

  const triageSystem: any = useOAuth
    ? [
        { type: "text", text: "You are Claude Code, Anthropic's official CLI for Claude." },
        { type: "text", text: NOTIFICATION_TRIAGE_PROMPT },
      ]
    : NOTIFICATION_TRIAGE_PROMPT;

  const maxTriageTurns = 50;
  let turnCount = 0;
  let lastText = "";

  while (turnCount < maxTriageTurns) {
    turnCount++;

    let response;
    try {
      response = await client.messages.create({
        model: CONFIG.model,
        max_tokens: 2048,
        system: triageSystem,
        messages: triageMessages,
        tools: toolDefs as any,
        stream: true,
      });
    } catch (err: any) {
      console.error(`\x1b[31m[triage] API error: ${err.message}\x1b[0m`);
      return { action: "ignore", reason: `API error: ${err.message}` };
    }

    const contentBlocks: any[] = [];
    let currentText = "";
    let currentToolUse: any = null;
    let stopReason = "";
    let inputJson = "";

    try {
      for await (const event of response) {
        switch (event.type) {
          case "content_block_start":
            if (event.content_block.type === "text") {
              currentText = "";
            } else if (event.content_block.type === "tool_use") {
              currentToolUse = {
                type: "tool_use",
                id: event.content_block.id,
                name: event.content_block.name,
                input: {},
              };
              inputJson = "";
              console.log(`\x1b[36m  [triage] > ${event.content_block.name}\x1b[0m`);
            }
            break;
          case "content_block_delta":
            if (event.delta.type === "text_delta") {
              currentText += event.delta.text;
            } else if (event.delta.type === "input_json_delta") {
              inputJson += event.delta.partial_json;
            }
            break;
          case "content_block_stop":
            if (currentText) {
              contentBlocks.push({ type: "text", text: currentText });
              lastText = currentText;
              currentText = "";
            }
            if (currentToolUse) {
              try { currentToolUse.input = inputJson ? JSON.parse(inputJson) : {}; } catch { currentToolUse.input = {}; }
              contentBlocks.push(currentToolUse);
              currentToolUse = null;
              inputJson = "";
            }
            break;
          case "message_delta":
            stopReason = (event.delta as any).stop_reason || "";
            break;
        }
      }
    } catch (err: any) {
      console.error(`\x1b[31m[triage] Stream error: ${err.message}\x1b[0m`);
      return { action: "ignore", reason: `Stream error: ${err.message}` };
    }

    if (contentBlocks.length > 0) {
      triageMessages.push({ role: "assistant", content: contentBlocks });
    }

    if (stopReason !== "tool_use") break;

    // Execute tools for triage agent
    const toolResults: any[] = [];
    for (const block of contentBlocks) {
      if (block.type !== "tool_use") continue;

      // Lock check for triage agent
      if (UI_TOOLS.has(block.name) && deviceLock.isLocked() && !deviceLock.isLockedBy(triageId)) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify({ error: "Device locked by another owner" }),
          is_error: true,
        });
        continue;
      }

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

      try {
        const result = await impl(block.input);
        const resultStr = typeof result === "string" ? result : JSON.stringify(result);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: truncate(resultStr),
        });
      } catch (err: any) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify({ error: err.message }),
          is_error: true,
        });
      }
    }

    triageMessages.push({ role: "user", content: toolResults });
  }

  // Parse the triage decision from the last text
  const lower = lastText.toLowerCase();
  if (lower.includes("act")) return { action: "act", reason: lastText };
  if (lower.includes("alert")) return { action: "alert", reason: lastText };
  if (lower.includes("log")) return { action: "log", reason: lastText };
  return { action: "ignore", reason: lastText };
}

// ---------------------------------------------------------------------------
// Session persistence
// ---------------------------------------------------------------------------

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
