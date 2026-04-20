import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { AdbWrapper } from "./adb-wrapper";
import { ToolResult, UiNode, UiDumpResult } from "./types";

const adb = new AdbWrapper();

export const uiDump = createTool({
  id: "ui.dump",
  description: "Dump the current UI hierarchy using UIAutomator",
  inputSchema: z.object({
    serial: z.string().optional().describe("Device serial (optional)")
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    data: z.object({
      xml: z.string(),
      timestamp: z.number()
    }).optional(),
    error: z.string().optional()
  }),
  execute: async ({ context: { serial } }): Promise<ToolResult<UiDumpResult>> => {
    try {
      if (serial) adb.setSerial(serial);

      // Dump UI hierarchy to device storage
      const dumpResult = await adb.runAdb(["shell", "uiautomator", "dump", "/sdcard/window_dump.xml"]);
      if (!dumpResult.ok) return dumpResult;

      // Read the XML file back
      const xmlResult = await adb.runAdb(["shell", "cat", "/sdcard/window_dump.xml"]);
      if (!xmlResult.ok) return xmlResult;

      return {
        ok: true,
        data: {
          xml: xmlResult.data!,
          timestamp: Date.now()
        }
      };
    } catch (error: any) {
      return { ok: false, error: error?.message || "Failed to dump UI" };
    }
  }
});

export const uiParse = createTool({
  id: "ui.parse",
  description: "Parse UI XML dump into structured UiNode array",
  inputSchema: z.object({
    xml: z.string().describe("UI hierarchy XML string")
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    data: z.array(z.object({
      text: z.string().optional(),
      desc: z.string().optional(),
      res: z.string().optional(),
      class: z.string().optional(),
      clickable: z.boolean().optional(),
      enabled: z.boolean().optional(),
      bounds: z.array(z.number()).optional()
    })).optional(),
    error: z.string().optional()
  }),
  execute: async ({ context: { xml } }): Promise<ToolResult<UiNode[]>> => {
    try {
      const nodes: UiNode[] = [];
      const nodeRegex = /<node [^>]+>/g;
      
      const getAttr = (tag: string, name: string): string | undefined => {
        const match = tag.match(new RegExp(`${name}="([^"]*)"`, "i"));
        return match ? match[1] : undefined;
      };

      for (const match of xml.matchAll(nodeRegex)) {
        const tag = match[0];
        const boundsStr = getAttr(tag, "bounds");
        let bounds: [number, number, number, number] | undefined;
        
        if (boundsStr) {
          const boundsMatch = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
          if (boundsMatch) {
            bounds = [
              Number(boundsMatch[1]), 
              Number(boundsMatch[2]), 
              Number(boundsMatch[3]), 
              Number(boundsMatch[4])
            ];
          }
        }

        nodes.push({
          text: getAttr(tag, "text"),
          desc: getAttr(tag, "content-desc"),
          res: getAttr(tag, "resource-id"),
          class: getAttr(tag, "class"),
          clickable: getAttr(tag, "clickable") === "true",
          enabled: getAttr(tag, "enabled") === "true",
          bounds
        });
      }

      return { ok: true, data: nodes };
    } catch (error: any) {
      return { ok: false, error: error?.message || "Failed to parse UI XML" };
    }
  }
});

export const uiFindByText = createTool({
  id: "ui.findByText",
  description: "Find UI node by text content",
  inputSchema: z.object({
    text: z.string().describe("Text to search for"),
    contains: z.boolean().optional().default(false).describe("Whether to match containing text or exact text"),
    nodes: z.array(z.any()).describe("Array of UiNode objects to search in")
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    data: z.object({
      text: z.string().optional(),
      desc: z.string().optional(),
      res: z.string().optional(),
      class: z.string().optional(),
      clickable: z.boolean().optional(),
      enabled: z.boolean().optional(),
      bounds: z.array(z.number()).optional()
    }).optional(),
    error: z.string().optional()
  }),
  execute: async ({ context: { text, contains = false, nodes } }): Promise<ToolResult<UiNode | undefined>> => {
    try {
      const foundNode = nodes.find((node: UiNode) => {
        if (!node.text) return false;
        return contains 
          ? node.text.toLowerCase().includes(text.toLowerCase())
          : node.text.toLowerCase() === text.toLowerCase();
      });

      return { ok: true, data: foundNode };
    } catch (error: any) {
      return { ok: false, error: error?.message || "Failed to find node by text" };
    }
  }
});

export const uiFindByDesc = createTool({
  id: "ui.findByDesc",
  description: "Find UI node by content description",
  inputSchema: z.object({
    desc: z.string().describe("Content description to search for"),
    contains: z.boolean().optional().default(false).describe("Whether to match containing desc or exact desc"),
    nodes: z.array(z.any()).describe("Array of UiNode objects to search in")
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    data: z.object({
      text: z.string().optional(),
      desc: z.string().optional(),
      res: z.string().optional(),
      class: z.string().optional(),
      clickable: z.boolean().optional(),
      enabled: z.boolean().optional(),
      bounds: z.array(z.number()).optional()
    }).optional(),
    error: z.string().optional()
  }),
  execute: async ({ context: { desc, contains = false, nodes } }): Promise<ToolResult<UiNode | undefined>> => {
    try {
      const foundNode = nodes.find((node: UiNode) => {
        if (!node.desc) return false;
        return contains 
          ? node.desc.toLowerCase().includes(desc.toLowerCase())
          : node.desc.toLowerCase() === desc.toLowerCase();
      });

      return { ok: true, data: foundNode };
    } catch (error: any) {
      return { ok: false, error: error?.message || "Failed to find node by description" };
    }
  }
});

export const uiFindByRes = createTool({
  id: "ui.findByRes",
  description: "Find UI node by resource ID",
  inputSchema: z.object({
    res: z.string().describe("Resource ID to search for"),
    nodes: z.array(z.any()).describe("Array of UiNode objects to search in")
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    data: z.object({
      text: z.string().optional(),
      desc: z.string().optional(),
      res: z.string().optional(),
      class: z.string().optional(),
      clickable: z.boolean().optional(),
      enabled: z.boolean().optional(),
      bounds: z.array(z.number()).optional()
    }).optional(),
    error: z.string().optional()
  }),
  execute: async ({ context: { res, nodes } }): Promise<ToolResult<UiNode | undefined>> => {
    try {
      const foundNode = nodes.find((node: UiNode) => node.res === res);
      return { ok: true, data: foundNode };
    } catch (error: any) {
      return { ok: false, error: error?.message || "Failed to find node by resource ID" };
    }
  }
});

export const uiTapNode = createTool({
  id: "ui.tapNode",
  description: "Tap the center of a UI node's bounds",
  inputSchema: z.object({
    node: z.object({
      bounds: z.array(z.number()).optional()
    }).describe("UiNode with bounds information"),
    serial: z.string().optional().describe("Device serial (optional)")
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    data: z.string().optional(),
    error: z.string().optional()
  }),
  execute: async ({ context: { node, serial } }): Promise<ToolResult<string>> => {
    try {
      if (!node.bounds || node.bounds.length !== 4) {
        return { ok: false, error: "Node bounds are invalid or missing" };
      }

      const [x1, y1, x2, y2] = node.bounds;
      const centerX = Math.floor((x1 + x2) / 2);
      const centerY = Math.floor((y1 + y2) / 2);

      if (serial) adb.setSerial(serial);
      return await adb.runAdb([
        "shell", "input", "tap",
        centerX.toString(), centerY.toString()
      ]);
    } catch (error: any) {
      return { ok: false, error: error?.message || "Failed to tap node" };
    }
  }
});

export const uiWaitForText = createTool({
  id: "ui.waitForText",
  description: "Wait for text to appear on screen within timeout",
  inputSchema: z.object({
    text: z.string().describe("Text to wait for"),
    contains: z.boolean().optional().default(false).describe("Whether to match containing text or exact text"),
    timeoutMs: z.number().optional().default(5000).describe("Timeout in milliseconds"),
    serial: z.string().optional().describe("Device serial (optional)")
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    data: z.boolean().optional(),
    error: z.string().optional()
  }),
  execute: async ({ context: { text, contains = false, timeoutMs = 5000, serial } }): Promise<ToolResult<boolean>> => {
    try {
      if (serial) adb.setSerial(serial);
      
      const startTime = Date.now();
      const pollInterval = 500; // Check every 500ms

      while (Date.now() - startTime < timeoutMs) {
        // Dump current UI
        const dumpResult = await uiDump.execute({ context: { serial } });
        if (dumpResult.ok && dumpResult.data) {
          // Parse UI
          const parseResult = await uiParse.execute({ context: { xml: dumpResult.data.xml } });
          if (parseResult.ok && parseResult.data) {
            // Search for text
            const foundNode = parseResult.data.find((node: UiNode) => {
              if (!node.text) return false;
              return contains 
                ? node.text.toLowerCase().includes(text.toLowerCase())
                : node.text.toLowerCase() === text.toLowerCase();
            });

            if (foundNode) {
              return { ok: true, data: true };
            }
          }
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }

      return { ok: true, data: false }; // Timeout reached
    } catch (error: any) {
      return { ok: false, error: error?.message || "Failed to wait for text" };
    }
  }
});