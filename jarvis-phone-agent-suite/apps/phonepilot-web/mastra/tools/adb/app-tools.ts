import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { AdbWrapper } from "./adb-wrapper";
import { ToolResult } from "./types";

const adb = new AdbWrapper();

export const appLaunch = createTool({
  id: "app.launch",
  description: "Launch an app with optional activity, action, data URI, extras, and flags",
  inputSchema: z.object({
    package: z.string().optional().describe("Package name (e.g., 'com.android.camera2') - optional if using action"),
    activity: z.string().optional().describe("Specific activity to launch"),
    action: z.string().optional().describe("Intent action (e.g., 'android.media.action.STILL_IMAGE_CAMERA')"),
    dataUri: z.string().optional().describe("Data URI for the intent"),
    extras: z.record(z.string()).optional().describe("Extra key-value pairs"),
    flags: z.array(z.string()).optional().describe("Intent flags"),
    serial: z.string().optional().describe("Device serial (optional)")
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    data: z.string().optional(),
    error: z.string().optional()
  }),
  execute: async ({ context: { package: pkg, activity, action, dataUri, extras, flags, serial } }): Promise<ToolResult<string>> => {
    if (serial) adb.setSerial(serial);

    const args = ["shell", "am", "start"];

    if (action) {
      args.push("-a", action);
    }

    if (dataUri) {
      args.push("-d", dataUri);
    }

    if (extras) {
      for (const [key, value] of Object.entries(extras)) {
        args.push("--es", key, value);
      }
    }

    if (flags) {
      for (const flag of flags) {
        args.push("-f", flag);
      }
    }

    // Only add package/activity if package is provided
    if (pkg) {
      if (activity) {
        args.push(`${pkg}/${activity}`);
      } else {
        args.push(pkg);
      }
    }

    return await adb.runAdb(args);
  }
});

export const appOpenUrl = createTool({
  id: "app.openUrl",
  description: "Open a URL using the default browser or appropriate app",
  inputSchema: z.object({
    url: z.string().describe("URL to open"),
    serial: z.string().optional().describe("Device serial (optional)")
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    data: z.string().optional(),
    error: z.string().optional()
  }),
  execute: async ({ context: { url, serial } }): Promise<ToolResult<string>> => {
    if (serial) adb.setSerial(serial);
    return await adb.runAdb([
      "shell", "am", "start", 
      "-a", "android.intent.action.VIEW", 
      "-d", url
    ]);
  }
});

export const appForceStop = createTool({
  id: "app.forceStop",
  description: "Force stop an application",
  inputSchema: z.object({
    package: z.string().describe("Package name to force stop"),
    serial: z.string().optional().describe("Device serial (optional)")
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    data: z.string().optional(),
    error: z.string().optional()
  }),
  execute: async ({ context: { package: pkg, serial } }): Promise<ToolResult<string>> => {
    if (serial) adb.setSerial(serial);
    return await adb.runAdb(["shell", "am", "force-stop", pkg]);
  }
});

export const appMonkeyLaunch = createTool({
  id: "app.monkeyLaunch",
  description: "Launch an app using monkey tool (LAUNCHER activity shortcut)",
  inputSchema: z.object({
    package: z.string().describe("Package name to launch"),
    serial: z.string().optional().describe("Device serial (optional)")
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    data: z.string().optional(),
    error: z.string().optional()
  }),
  execute: async ({ context: { package: pkg, serial } }): Promise<ToolResult<string>> => {
    if (serial) adb.setSerial(serial);
    return await adb.runAdb([
      "shell", "monkey", 
      "-p", pkg, 
      "-c", "android.intent.category.LAUNCHER", 
      "1"
    ]);
  }
});

export const appListInstalled = createTool({
  id: "app.listInstalled",
  description: "List all installed packages on the device",
  inputSchema: z.object({
    thirdPartyOnly: z.boolean().optional().default(true).describe("Only show third-party apps (default: true)"),
    enabled: z.boolean().optional().default(true).describe("Only show enabled apps (default: true)"),
    serial: z.string().optional().describe("Device serial (optional)")
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    data: z.array(z.object({
      package: z.string(),
      name: z.string().optional()
    })).optional(),
    error: z.string().optional()
  }),
  execute: async ({ context: { thirdPartyOnly = true, enabled = true, serial } }): Promise<ToolResult<Array<{package: string; name?: string}>>> => {
    try {
      if (serial) adb.setSerial(serial);

      const args = ["shell", "pm", "list", "packages"];
      
      if (thirdPartyOnly) {
        args.push("-3"); // Third party packages only
      }
      
      if (enabled) {
        args.push("-e"); // Enabled packages only
      }

      const result = await adb.runAdb(args);
      
      if (!result.ok || !result.data) {
        return { ok: false, error: "Failed to list packages" };
      }

      // Parse package list - format: "package:com.example.app"
      const packages = result.data
        .split('\n')
        .filter(line => line.startsWith('package:'))
        .map(line => {
          const pkg = line.substring(8); // Remove "package:" prefix
          return { package: pkg };
        });

      return { ok: true, data: packages };
    } catch (error: any) {
      return { ok: false, error: error?.message || "Failed to list installed apps" };
    }
  }
});

export const appGetCurrent = createTool({
  id: "app.getCurrent",
  description: "Get the currently running/foreground application",
  inputSchema: z.object({
    serial: z.string().optional().describe("Device serial (optional)")
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    data: z.object({
      package: z.string(),
      activity: z.string().optional()
    }).optional(),
    error: z.string().optional()
  }),
  execute: async ({ context: { serial } }): Promise<ToolResult<{package: string; activity?: string}>> => {
    try {
      if (serial) adb.setSerial(serial);

      // Get current activity using dumpsys
      const result = await adb.runAdb([
        "shell", "dumpsys", "activity", "activities", "|", "grep", "-E", "mResumedActivity|mFocusedActivity", "|", "head", "-1"
      ]);
      
      if (!result.ok || !result.data) {
        return { ok: false, error: "Failed to get current activity" };
      }

      // Parse the output to extract package name
      // Format: "mResumedActivity: ActivityRecord{...} u0 com.example.app/.MainActivity t123}"
      const match = result.data.match(/\s+([a-zA-Z0-9_.]+)\/([a-zA-Z0-9_.]+)/);
      
      if (match) {
        return { 
          ok: true, 
          data: { 
            package: match[1],
            activity: match[2]
          }
        };
      }

      // Fallback: try alternative method
      const fallbackResult = await adb.runAdb([
        "shell", "dumpsys", "window", "windows", "|", "grep", "-E", "mCurrentFocus", "|", "head", "-1"
      ]);

      if (fallbackResult.ok && fallbackResult.data) {
        const fallbackMatch = fallbackResult.data.match(/\s+([a-zA-Z0-9_.]+)\//);
        if (fallbackMatch) {
          return { 
            ok: true, 
            data: { 
              package: fallbackMatch[1]
            }
          };
        }
      }

      return { ok: false, error: "Could not determine current app" };
    } catch (error: any) {
      return { ok: false, error: error?.message || "Failed to get current app" };
    }
  }
});