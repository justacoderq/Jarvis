import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { AdbWrapper } from "./adb-wrapper";
import { ToolResult } from "./types";

const adb = new AdbWrapper();

export const inputTap = createTool({
  id: "input.tap",
  description: "Tap at specific coordinates on the screen",
  inputSchema: z.object({
    x: z.number().describe("X coordinate"),
    y: z.number().describe("Y coordinate"),
    serial: z.string().optional().describe("Device serial (optional)")
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    data: z.string().optional(),
    error: z.string().optional()
  }),
  execute: async ({ context: { x, y, serial } }): Promise<ToolResult<string>> => {
    if (serial) adb.setSerial(serial);
    return await adb.runAdb([
      "shell", "input", "tap", 
      x.toString(), y.toString()
    ]);
  }
});

export const inputSwipe = createTool({
  id: "input.swipe",
  description: "Swipe from one point to another",
  inputSchema: z.object({
    x1: z.number().optional().describe("Starting X coordinate"),
    y1: z.number().optional().describe("Starting Y coordinate"),
    x2: z.number().optional().describe("Ending X coordinate"),
    y2: z.number().optional().describe("Ending Y coordinate"),
    durationMs: z.number().optional().default(500).describe("Swipe duration in milliseconds"),
    // Alternative parameter names for compatibility with planner
    startX: z.number().optional().describe("Starting X coordinate (alternative name)"),
    startY: z.number().optional().describe("Starting Y coordinate (alternative name)"),
    endX: z.number().optional().describe("Ending X coordinate (alternative name)"),
    endY: z.number().optional().describe("Ending Y coordinate (alternative name)"),
    duration: z.number().optional().describe("Swipe duration in milliseconds (alternative name)"),
    serial: z.string().optional().describe("Device serial (optional)")
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    data: z.string().optional(),
    error: z.string().optional()
  }),
  execute: async ({ context: { x1, y1, x2, y2, durationMs = 500, startX, startY, endX, endY, duration, serial } }): Promise<ToolResult<string>> => {
    if (serial) adb.setSerial(serial);
    
    // Use alternative parameter names if provided (for planner compatibility)
    const finalX1 = startX ?? x1;
    const finalY1 = startY ?? y1;
    const finalX2 = endX ?? x2;
    const finalY2 = endY ?? y2;
    const finalDuration = duration ?? durationMs ?? 500;
    
    if (finalX1 === undefined || finalY1 === undefined || finalX2 === undefined || finalY2 === undefined) {
      return { ok: false, error: "Missing swipe coordinates. Provide either x1,y1,x2,y2 or startX,startY,endX,endY." };
    }
    
    return await adb.runAdb([
      "shell", "input", "swipe",
      finalX1.toString(), finalY1.toString(),
      finalX2.toString(), finalY2.toString(),
      finalDuration.toString()
    ]);
  }
});

export const inputLongPress = createTool({
  id: "input.longPress",
  description: "Long press at specific coordinates",
  inputSchema: z.object({
    x: z.number().describe("X coordinate"),
    y: z.number().describe("Y coordinate"),
    durationMs: z.number().optional().default(1000).describe("Long press duration in milliseconds"),
    serial: z.string().optional().describe("Device serial (optional)")
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    data: z.string().optional(),
    error: z.string().optional()
  }),
  execute: async ({ context: { x, y, durationMs = 1000, serial } }): Promise<ToolResult<string>> => {
    if (serial) adb.setSerial(serial);
    
    // Long press is implemented as a swipe with the same start and end coordinates
    return await adb.runAdb([
      "shell", "input", "swipe",
      x.toString(), y.toString(),
      x.toString(), y.toString(),
      durationMs.toString()
    ]);
  }
});

export const inputTypeText = createTool({
  id: "input.typeText",
  description: "Type text on the device (escapes for ADB input)",
  inputSchema: z.object({
    text: z.string().describe("Text to type"),
    serial: z.string().optional().describe("Device serial (optional)")
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    data: z.string().optional(),
    error: z.string().optional()
  }),
  execute: async ({ context: { text, serial } }): Promise<ToolResult<string>> => {
    if (serial) adb.setSerial(serial);
    
    // Escape special characters for ADB input
    const escapedText = text
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/'/g, "\\'")
      .replace(/\s/g, '%s')
      .replace(/&/g, '\\&')
      .replace(/</g, '\\<')
      .replace(/>/g, '\\>')
      .replace(/\|/g, '\\|')
      .replace(/;/g, '\\;')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/\$/g, '\\$')
      .replace(/`/g, '\\`')
      .replace(/\*/g, '\\*')
      .replace(/\?/g, '\\?')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}');

    return await adb.runAdb(["shell", "input", "text", escapedText]);
  }
});