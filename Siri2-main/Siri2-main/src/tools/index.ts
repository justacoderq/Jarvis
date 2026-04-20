import { executeShell } from "../services/shell-executor.js";
import { parseUiDump } from "../services/xml-parser.js";
import { getNotifications } from "../services/notification-watcher.js";
import { scheduler } from "../services/scheduler.js";

// ---------------------------------------------------------------------------
// UI tools that require device lock
// ---------------------------------------------------------------------------

export const UI_TOOLS = new Set([
  "dump_ui_tree", "find_and_tap", "tap", "input_text", "press_key", "swipe", "take_screenshot",
]);

// ---------------------------------------------------------------------------
// Auto-dump: action tools that get an automatic UI dump appended
// ---------------------------------------------------------------------------

export const ACTION_TOOLS_WITH_AUTO_DUMP = new Set([
  "tap", "swipe", "press_key", "input_text", "launch_app",
]);

export const AUTO_DUMP_DELAY: Record<string, number> = {
  tap: 200,
  press_key: 200,
  input_text: 200,
  swipe: 300,
  launch_app: 800,
};

// ---------------------------------------------------------------------------
// UI dump caching — prevents redundant dumps within a short window
// ---------------------------------------------------------------------------

let lastDumpResult: string | null = null;
let lastDumpTime = 0;
let dumpInvalidated = true;
const DUMP_CACHE_TTL = 1500;

export function invalidateDumpCache(): void {
  dumpInvalidated = true;
}

// ---------------------------------------------------------------------------
// Compact UI dump formatting
// ---------------------------------------------------------------------------

function formatCompactNode(n: any, i: number): string {
  const parts: string[] = [];
  if (n.text) parts.push(`"${n.text}"`);
  if (n.contentDesc && n.contentDesc !== n.text) parts.push(`desc:"${n.contentDesc}"`);
  parts.push(`(${n.centerX},${n.centerY})`);
  if (n.clickable) parts.push("CLICK");
  if (n.scrollable) parts.push("SCROLL");
  if (n.checked) parts.push("CHK");
  if (n.focused) parts.push("FOC");
  if (n.resourceId) {
    const shortId = n.resourceId.includes("/") ? n.resourceId.split("/").pop() : n.resourceId;
    parts.push(`id:${shortId}`);
  }
  return `[${i}] ${parts.join(" ")}`;
}

async function performUiDump(): Promise<string> {
  const now = Date.now();
  if (!dumpInvalidated && lastDumpResult && (now - lastDumpTime) < DUMP_CACHE_TTL) {
    return lastDumpResult;
  }

  const dump = await executeShell(
    "uiautomator dump /sdcard/window_dump.xml && cat /sdcard/window_dump.xml",
    { timeout: 15_000 }
  );
  if (dump.exitCode !== 0 || !dump.stdout.includes("<hierarchy")) {
    return JSON.stringify({ ok: false, error: dump.stderr || "Failed to dump UI tree" });
  }
  const tree = parseUiDump(dump.stdout);
  const formatted = tree.nodes.map((n, i) => formatCompactNode(n, i));
  const result = JSON.stringify({
    ok: true,
    packageName: tree.packageName,
    elementCount: tree.nodes.length,
    elements: formatted.join("\n"),
  });

  lastDumpResult = result;
  lastDumpTime = Date.now();
  dumpInvalidated = false;
  return result;
}

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------

export const toolImplementations: Record<string, (args: any) => Promise<string>> = {};

function defineTool(
  name: string,
  description: string,
  inputSchema: Record<string, any>,
  execute: (args: any) => Promise<string>
) {
  toolImplementations[name] = execute;
  return { name, description, input_schema: inputSchema };
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export const toolDefs = [
  defineTool(
    "dump_ui_tree",
    "Dump the current Android UI tree. Returns all visible UI elements with text, positions, and whether they are clickable/scrollable. Note: after action tools (tap, swipe, press_key, input_text, launch_app), a UI dump is automatically appended — you don't need to call this again.",
    { type: "object", properties: {} },
    async () => performUiDump()
  ),

  defineTool(
    "tap",
    "Tap on screen at (x, y) coordinates. Use dump_ui_tree first to find coordinates.",
    {
      type: "object",
      properties: {
        x: { type: "number", description: "X coordinate" },
        y: { type: "number", description: "Y coordinate" },
      },
      required: ["x", "y"],
    },
    async (args) => {
      const r = await executeShell(`input tap ${args.x} ${args.y}`);
      return JSON.stringify({ ok: r.exitCode === 0, action: `tapped (${args.x},${args.y})` });
    }
  ),

  defineTool(
    "find_and_tap",
    "Find a UI element by text and tap it. Combines dump_ui_tree + tap into one call. Returns the matched element info and a post-tap UI dump. If no match is found, returns the current UI tree so you can see what's on screen.",
    {
      type: "object",
      properties: {
        text: { type: "string", description: "Substring to match (case-insensitive) against element text or content description" },
        index: { type: "number", description: "If multiple matches, which one to tap (0-based, default 0)" },
      },
      required: ["text"],
    },
    async (args) => {
      invalidateDumpCache();
      const dump = await executeShell(
        "uiautomator dump /sdcard/window_dump.xml && cat /sdcard/window_dump.xml",
        { timeout: 15_000 }
      );
      if (dump.exitCode !== 0 || !dump.stdout.includes("<hierarchy")) {
        return JSON.stringify({ ok: false, error: dump.stderr || "Failed to dump UI tree" });
      }
      const tree = parseUiDump(dump.stdout);
      const query = args.text.toLowerCase();
      const matches = tree.nodes.filter(
        (n) =>
          n.text?.toLowerCase().includes(query) ||
          n.contentDesc?.toLowerCase().includes(query)
      );
      if (matches.length === 0) {
        const formatted = tree.nodes.map((n, i) => formatCompactNode(n, i));
        return JSON.stringify({
          ok: false,
          error: `No element matching "${args.text}" found`,
          packageName: tree.packageName,
          elementCount: tree.nodes.length,
          elements: formatted.join("\n"),
        });
      }
      const idx = args.index || 0;
      const target = matches[Math.min(idx, matches.length - 1)];
      await executeShell(`input tap ${target.centerX} ${target.centerY}`);
      await new Promise((r) => setTimeout(r, 200));
      invalidateDumpCache();
      const postDump = await performUiDump();
      return JSON.stringify({
        ok: true,
        tapped: { text: target.text, desc: target.contentDesc, pos: [target.centerX, target.centerY] },
        matchCount: matches.length,
        uiDump: JSON.parse(postDump),
      });
    }
  ),

  defineTool(
    "input_text",
    "Type text into the currently focused input field. Tap the field first to focus it.",
    {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to type" },
      },
      required: ["text"],
    },
    async (args) => {
      const text: string = args.text;
      // Type in chunks of 4 chars with 30ms delays to avoid misspelling
      const CHUNK = 4;
      for (let i = 0; i < text.length; i += CHUNK) {
        const chunk = text.slice(i, i + CHUNK).replace(/ /g, "%s");
        const r = await executeShell(`input text '${chunk}'`);
        if (r.exitCode !== 0) {
          return JSON.stringify({ ok: false, typed: text.slice(0, i), error: "input failed mid-type" });
        }
        if (i + CHUNK < text.length) {
          await new Promise((r) => setTimeout(r, 30));
        }
      }
      return JSON.stringify({ ok: true, typed: text });
    }
  ),

  defineTool(
    "press_key",
    "Press an Android key. Common: HOME=3, BACK=4, ENTER=66, DEL=67, TAB=61, RECENT_APPS=187",
    {
      type: "object",
      properties: {
        keycode: { type: "number", description: "Android keycode (e.g. 3=HOME, 4=BACK, 66=ENTER)" },
      },
      required: ["keycode"],
    },
    async (args) => {
      const r = await executeShell(`input keyevent ${args.keycode}`);
      return JSON.stringify({ ok: r.exitCode === 0, key: args.keycode });
    }
  ),

  defineTool(
    "swipe",
    "Swipe on screen. Use for scrolling: swipe bottom-to-top to scroll down.",
    {
      type: "object",
      properties: {
        x1: { type: "number", description: "Start X" },
        y1: { type: "number", description: "Start Y" },
        x2: { type: "number", description: "End X" },
        y2: { type: "number", description: "End Y" },
        duration: { type: "number", description: "Duration ms (default 300)" },
      },
      required: ["x1", "y1", "x2", "y2"],
    },
    async (args) => {
      const dur = args.duration || 300;
      const r = await executeShell(`input swipe ${args.x1} ${args.y1} ${args.x2} ${args.y2} ${dur}`);
      return JSON.stringify({ ok: r.exitCode === 0 });
    }
  ),

  defineTool(
    "launch_app",
    "Launch an Android app by package name. Use list_packages to find package names.",
    {
      type: "object",
      properties: {
        package_name: { type: "string", description: "Package name (e.g. com.google.android.gm)" },
      },
      required: ["package_name"],
    },
    async (args) => {
      const r = await executeShell(
        `monkey -p ${args.package_name} -c android.intent.category.LAUNCHER 1`,
        { timeout: 10_000 }
      );
      return JSON.stringify({ ok: r.exitCode === 0 || r.stdout.includes("Events injected"), launched: args.package_name });
    }
  ),

  defineTool(
    "list_packages",
    "List installed Android packages, optionally filtered by keyword.",
    {
      type: "object",
      properties: {
        filter: { type: "string", description: "Optional keyword filter" },
      },
    },
    async (args) => {
      const r = await executeShell("pm list packages", { timeout: 10_000 });
      if (r.exitCode !== 0) return JSON.stringify({ ok: false, error: r.stderr });
      let pkgs = r.stdout.split("\n").map((l) => l.replace("package:", "").trim()).filter(Boolean);
      if (args.filter) {
        const f = args.filter.toLowerCase();
        pkgs = pkgs.filter((p) => p.toLowerCase().includes(f));
      }
      return JSON.stringify({ ok: true, count: pkgs.length, packages: pkgs });
    }
  ),

  defineTool(
    "run_shell",
    "Execute a shell command as root via su -c.",
    {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to execute" },
        timeout: { type: "number", description: "Timeout ms (default 10000)" },
      },
      required: ["command"],
    },
    async (args) => {
      const r = await executeShell(args.command, { timeout: args.timeout || 10_000 });
      return JSON.stringify({ ok: r.exitCode === 0, stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode });
    }
  ),

  defineTool(
    "take_screenshot",
    "Take a screenshot. Returns base64 PNG.",
    { type: "object", properties: {} },
    async () => {
      const r = await executeShell("screencap -p /sdcard/siri2_screenshot.png", { timeout: 10_000 });
      if (r.exitCode !== 0) return JSON.stringify({ ok: false, error: r.stderr });
      const b64 = await executeShell("cat /sdcard/siri2_screenshot.png | base64", {
        timeout: 15_000,
        maxBuffer: 10 * 1024 * 1024,
      });
      if (!b64.stdout) return JSON.stringify({ ok: false, error: "Could not encode screenshot" });
      return JSON.stringify({ ok: true, base64: b64.stdout.replace(/\s/g, "").slice(0, 100000) });
    }
  ),

  defineTool(
    "get_notifications",
    "Get all current Android notifications with title, text, app, and available actions.",
    { type: "object", properties: {} },
    async () => {
      const notifications = await getNotifications();
      return JSON.stringify({
        ok: true,
        count: notifications.length,
        notifications: notifications.map((n) => ({
          package: n.packageName,
          title: n.title,
          text: n.text,
          actions: n.actions,
          ongoing: n.isOngoing,
        })),
      });
    }
  ),

  defineTool(
    "get_device_info",
    "Get device status: battery, WiFi, screen state, foreground app.",
    { type: "object", properties: {} },
    async () => {
      const [battery, wifi, display, activity] = await Promise.all([
        executeShell("dumpsys battery | grep -E 'level|status|plugged'"),
        executeShell("dumpsys wifi | grep 'Wi-Fi is' | head -1"),
        executeShell("dumpsys display | grep 'mScreenState' | head -1"),
        executeShell("dumpsys window | grep 'mFocusedApp' | head -1"),
      ]);
      return JSON.stringify({
        ok: true,
        battery: battery.stdout.trim(),
        wifi: wifi.stdout.trim(),
        display: display.stdout.trim(),
        foreground: activity.stdout.trim(),
      });
    }
  ),

  // ---------------------------------------------------------------------------
  // Schedule management tools
  // ---------------------------------------------------------------------------

  defineTool(
    "create_schedule",
    "Create a scheduled task that runs on a cron schedule. The agent will be woken up, the phone unlocked, the prompt executed, and the phone re-locked. Use 5-field cron: min hour dom month dow. Examples: '0 1 * * *' = 1am daily, '*/5 * * * *' = every 5 min, '0 9 * * 1-5' = 9am weekdays.",
    {
      type: "object",
      properties: {
        name: { type: "string", description: "Human-readable name for this scheduled task" },
        prompt: { type: "string", description: "Full prompt to send to the agent when this task fires" },
        cron_expression: { type: "string", description: "5-field cron expression (min hour dom month dow)" },
      },
      required: ["name", "prompt", "cron_expression"],
    },
    async (args) => {
      const task = scheduler.addTask({
        name: args.name,
        prompt: args.prompt,
        cronExpression: args.cron_expression,
      });
      return JSON.stringify({
        ok: true,
        task: {
          id: task.id,
          name: task.name,
          cronExpression: task.cronExpression,
          enabled: task.enabled,
        },
        message: `Schedule created: "${task.name}" with cron ${task.cronExpression}`,
      });
    }
  ),

  defineTool(
    "list_schedules",
    "List all scheduled tasks with their IDs, names, cron expressions, enabled state, and last run info.",
    { type: "object", properties: {} },
    async () => {
      const tasks = scheduler.getTasks();
      return JSON.stringify({
        ok: true,
        count: tasks.length,
        tasks: tasks.map((t) => ({
          id: t.id,
          name: t.name,
          cronExpression: t.cronExpression,
          enabled: t.enabled,
          lastRunAt: t.lastRunAt ? new Date(t.lastRunAt).toISOString() : null,
          lastResult: t.lastResult,
        })),
      });
    }
  ),

  defineTool(
    "remove_schedule",
    "Remove a scheduled task by ID.",
    {
      type: "object",
      properties: {
        schedule_id: { type: "string", description: "ID of the schedule to remove" },
      },
      required: ["schedule_id"],
    },
    async (args) => {
      const removed = scheduler.removeTask(args.schedule_id);
      return JSON.stringify({
        ok: removed,
        message: removed ? "Schedule removed" : "Schedule not found",
      });
    }
  ),

  defineTool(
    "toggle_schedule",
    "Enable or disable a scheduled task.",
    {
      type: "object",
      properties: {
        schedule_id: { type: "string", description: "ID of the schedule to toggle" },
        enabled: { type: "boolean", description: "true to enable, false to disable" },
      },
      required: ["schedule_id", "enabled"],
    },
    async (args) => {
      const ok = args.enabled
        ? scheduler.enableTask(args.schedule_id)
        : scheduler.disableTask(args.schedule_id);
      return JSON.stringify({
        ok,
        message: ok ? `Schedule ${args.enabled ? "enabled" : "disabled"}` : "Schedule not found",
      });
    }
  ),
];
