import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { ToolResult } from "./types";

export const coordsScaleNormToDevice = createTool({
  id: "coords.scaleNormToDevice",
  description: "Convert normalized coordinates (0-1) to device coordinates",
  inputSchema: z.object({
    nx: z.number().min(0).max(1).describe("Normalized X coordinate (0-1)"),
    ny: z.number().min(0).max(1).describe("Normalized Y coordinate (0-1)"),
    deviceW: z.number().describe("Device width in pixels"),
    deviceH: z.number().describe("Device height in pixels")
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    data: z.object({
      x: z.number(),
      y: z.number()
    }).optional(),
    error: z.string().optional()
  }),
  execute: async ({ context: { nx, ny, deviceW, deviceH } }): Promise<ToolResult<{ x: number; y: number }>> => {
    try {
      const x = Math.floor(nx * deviceW);
      const y = Math.floor(ny * deviceH);
      
      return {
        ok: true,
        data: { x, y }
      };
    } catch (error: any) {
      return { ok: false, error: error?.message || "Failed to scale coordinates" };
    }
  }
});

export const coordsCenter = createTool({
  id: "coords.center",
  description: "Calculate center coordinates from bounds [x1, y1, x2, y2]",
  inputSchema: z.object({
    bounds: z.array(z.number()).length(4).describe("Bounds array [x1, y1, x2, y2]")
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    data: z.object({
      x: z.number(),
      y: z.number()
    }).optional(),
    error: z.string().optional()
  }),
  execute: async ({ context: { bounds } }): Promise<ToolResult<{ x: number; y: number }>> => {
    try {
      const [x1, y1, x2, y2] = bounds;
      const x = Math.floor((x1 + x2) / 2);
      const y = Math.floor((y1 + y2) / 2);
      
      return {
        ok: true,
        data: { x, y }
      };
    } catch (error: any) {
      return { ok: false, error: error?.message || "Failed to calculate center coordinates" };
    }
  }
});