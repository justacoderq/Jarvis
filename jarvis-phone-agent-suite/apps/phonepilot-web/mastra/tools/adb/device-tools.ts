import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { AdbWrapper } from "./adb-wrapper";
import { ToolResult, DeviceInfo } from "./types";

const adb = new AdbWrapper();

export const deviceGetInfo = createTool({
  id: "device.getInfo",
  description: "Get device information including width, height, density, orientation, and focused component",
  inputSchema: z.object({
    serial: z.string().optional().describe("Device serial (optional)")
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    data: z.object({
      width: z.number(),
      height: z.number(),
      density: z.number(),
      orientation: z.number(),
      focusComponent: z.string().optional()
    }).optional(),
    error: z.string().optional()
  }),
  execute: async ({ context: { serial } }): Promise<ToolResult<DeviceInfo>> => {
    try {
      if (serial) adb.setSerial(serial);

      // Get window size
      const sizeResult = await adb.runAdb(["shell", "wm", "size"]);
      if (!sizeResult.ok) return { ok: false, error: sizeResult.error };

      // Get density
      const densityResult = await adb.runAdb(["shell", "wm", "density"]);
      if (!densityResult.ok) return { ok: false, error: densityResult.error };

      // Get orientation (0=portrait, 1=landscape, 2=reverse portrait, 3=reverse landscape)
      const orientationResult = await adb.runAdb(["shell", "dumpsys", "input", "|", "grep", "'SurfaceOrientation'"]);

      // Get focused window/component
      const focusResult = await adb.runAdb(["shell", "dumpsys", "window", "windows", "|", "grep", "-E", "'mCurrentFocus|mFocusedApp'"]);

      // Parse size (format: "Physical size: 1080x2340")
      const sizeMatch = sizeResult.data?.match(/(\d+)x(\d+)/);
      const width = sizeMatch ? parseInt(sizeMatch[1]) : 1080;
      const height = sizeMatch ? parseInt(sizeMatch[2]) : 2340;

      // Parse density (format: "Physical density: 420")
      const densityMatch = densityResult.data?.match(/(\d+)/);
      const density = densityMatch ? parseInt(densityMatch[1]) : 420;

      // Parse orientation
      const orientationMatch = orientationResult.data?.match(/SurfaceOrientation:\s*(\d+)/);
      const orientation = orientationMatch ? parseInt(orientationMatch[1]) : 0;

      // Parse focused component
      const focusMatch = focusResult.data?.match(/mCurrentFocus=Window\{[^}]*\s+([^}]+)\}/);
      const focusComponent = focusMatch?.[1];

      return {
        ok: true,
        data: {
          width,
          height,
          density,
          orientation,
          focusComponent
        }
      };
    } catch (error: any) {
      return { ok: false, error: error?.message || "Failed to get device info" };
    }
  }
});

export const deviceWake = createTool({
  id: "device.wake",
  description: "Wake up the device screen and perform unlock swipe",
  inputSchema: z.object({
    includeSwipe: z.boolean().optional().default(true).describe("Automatically perform unlock swipe after wake"),
    serial: z.string().optional().describe("Device serial (optional)")
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    data: z.string().optional(),
    error: z.string().optional()
  }),
  execute: async ({ context: { includeSwipe = true, serial } }): Promise<ToolResult<string>> => {
    if (serial) adb.setSerial(serial);
    
    // Use keyevent 224 which has been tested and confirmed to work
    const wakeResult = await adb.runAdb(["shell", "input", "keyevent", "224"]);
    
    if (!wakeResult.ok) {
      return wakeResult;
    }
    
    if (includeSwipe) {
      // Small delay to let the screen wake up, but keep it minimal
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Perform the unlock swipe using your tested coordinates
      const swipeResult = await adb.runAdb([
        "shell", "input", "swipe", 
        "500", "1800", "500", "600", "300"
      ]);
      
      if (!swipeResult.ok) {
        return { 
          ok: false, 
          error: `Wake succeeded but swipe failed: ${swipeResult.error}` 
        };
      }
      
      return { 
        ok: true, 
        data: `Device woken and unlock swipe performed. Wake: ${wakeResult.data}, Swipe: ${swipeResult.data}` 
      };
    }
    
    return wakeResult;
  }
});

export const deviceSleep = createTool({
  id: "device.sleep",
  description: "Put the device to sleep",
  inputSchema: z.object({
    serial: z.string().optional().describe("Device serial (optional)")
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    data: z.string().optional(),
    error: z.string().optional()
  }),
  execute: async ({ context: { serial } }): Promise<ToolResult<string>> => {
    if (serial) adb.setSerial(serial);
    return await adb.runAdb(["shell", "input", "keyevent", "KEYCODE_POWER"]);
  }
});

export const deviceUnlockWithSwipe = createTool({
  id: "device.unlockWithSwipe",
  description: "Unlock device with upward swipe gesture",
  inputSchema: z.object({
    useFixedCoords: z.boolean().optional().default(false).describe("Use tested fixed coordinates instead of dynamic calculation"),
    serial: z.string().optional().describe("Device serial (optional)")
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    data: z.string().optional(),
    error: z.string().optional()
  }),
  execute: async ({ context: { useFixedCoords = false, serial } }): Promise<ToolResult<string>> => {
    if (serial) adb.setSerial(serial);
    
    if (useFixedCoords) {
      // Use tested coordinates: adb shell input swipe 500 1800 500 600 300
      return await adb.runAdb([
        "shell", "input", "swipe", 
        "500", "1800", "500", "600", "300"
      ]);
    }
    
    // Get device info first to calculate swipe coordinates
    const infoResult = await adb.runAdb(["shell", "wm", "size"]);
    if (!infoResult.ok) {
      // Fallback to tested fixed coordinates if device info fails
      return await adb.runAdb([
        "shell", "input", "swipe", 
        "500", "1800", "500", "600", "300"
      ]);
    }
    
    // Parse size (format: "Physical size: 1080x2340")
    const sizeMatch = infoResult.data?.match(/(\d+)x(\d+)/);
    const width = sizeMatch ? parseInt(sizeMatch[1]) : 1080;
    const height = sizeMatch ? parseInt(sizeMatch[2]) : 2340;
    const startY = Math.floor(height * 0.8);
    const endY = Math.floor(height * 0.2);
    const centerX = Math.floor(width * 0.5);

    return await adb.runAdb([
      "shell", "input", "swipe", 
      centerX.toString(), startY.toString(), 
      centerX.toString(), endY.toString(), 
      "300"  // Changed to match your tested duration
    ]);
  }
});

export const deviceKeyevent = createTool({
  id: "device.keyevent",
  description: "Send a key event to the device",
  inputSchema: z.object({
    codeOrName: z.string().optional().describe("Key code number or name (e.g., '4' or 'KEYCODE_BACK')"),
    key: z.string().optional().describe("Key name (alternative parameter name for compatibility)"),
    serial: z.string().optional().describe("Device serial (optional)")
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    data: z.string().optional(),
    error: z.string().optional()
  }),
  execute: async ({ context: { codeOrName, key, serial } }): Promise<ToolResult<string>> => {
    if (serial) adb.setSerial(serial);
    
    // Use either codeOrName or key parameter (key takes precedence for backward compatibility)
    const keyValue = key || codeOrName;
    
    if (!keyValue) {
      return { ok: false, error: "No key specified. Provide either 'key' or 'codeOrName' parameter." };
    }
    
    // Map common key names to tested keycodes
    const keyMappings: { [key: string]: string } = {
      'power': '224',  // Tested wake keycode
      'wake': '224',   // Same as power for wake functionality
    };
    
    const keycode = keyMappings[keyValue.toLowerCase()] || keyValue;
    return await adb.runAdb(["shell", "input", "keyevent", keycode]);
  }
});