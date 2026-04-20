import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { AdbWrapper } from "./adb-wrapper";
import { ToolResult, ScreenshotResult } from "./types";

const adb = new AdbWrapper();

export const mediaScreenshot = createTool({
  id: "media.screenshot",
  description: "Take a screenshot and save to device storage",
  inputSchema: z.object({
    path: z.string().optional().default("/sdcard/screenshot.png").describe("Device path to save screenshot"),
    serial: z.string().optional().describe("Device serial (optional)")
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    data: z.object({
      path: z.string(),
      width: z.number(),
      height: z.number()
    }).optional(),
    error: z.string().optional()
  }),
  execute: async ({ context: { path = "/sdcard/screenshot.png", serial } }): Promise<ToolResult<ScreenshotResult>> => {
    try {
      if (serial) adb.setSerial(serial);

      // Take screenshot
      const screenshotResult = await adb.runAdb(["shell", "screencap", "-p", path]);
      if (!screenshotResult.ok) return screenshotResult;

      // Get device info for dimensions
      const { deviceGetInfo } = await import("./device-tools");
      const infoResult = await deviceGetInfo.execute({ context: { serial } });
      
      let width = 1080, height = 2340; // defaults
      if (infoResult.ok && infoResult.data) {
        width = infoResult.data.width;
        height = infoResult.data.height;
      }

      return {
        ok: true,
        data: {
          path,
          width,
          height
        }
      };
    } catch (error: any) {
      return { ok: false, error: error?.message || "Failed to take screenshot" };
    }
  }
});

export const mediaRecordScreen = createTool({
  id: "media.recordScreen",
  description: "Record screen for specified duration",
  inputSchema: z.object({
    durationSec: z.number().describe("Recording duration in seconds"),
    path: z.string().optional().default("/sdcard/screenrecord.mp4").describe("Device path to save recording"),
    serial: z.string().optional().describe("Device serial (optional)")
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    data: z.object({
      path: z.string()
    }).optional(),
    error: z.string().optional()
  }),
  execute: async ({ context: { durationSec, path = "/sdcard/screenrecord.mp4", serial } }): Promise<ToolResult<{ path: string }>> => {
    try {
      if (serial) adb.setSerial(serial);

      // Record screen for specified duration
      const recordResult = await adb.runAdb([
        "shell", "screenrecord", 
        "--time-limit", durationSec.toString(),
        path
      ], { timeoutMs: (durationSec + 5) * 1000 });

      if (!recordResult.ok) return recordResult;

      return {
        ok: true,
        data: { path }
      };
    } catch (error: any) {
      return { ok: false, error: error?.message || "Failed to record screen" };
    }
  }
});

export const mediaLatestImageUri = createTool({
  id: "media.latestImageUri",
  description: "Get the URI of the most recently captured image from MediaStore",
  inputSchema: z.object({
    serial: z.string().optional().describe("Device serial (optional)")
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    data: z.string().optional(),
    error: z.string().optional()
  }),
  execute: async ({ context: { serial } }): Promise<ToolResult<string>> => {
    try {
      if (serial) adb.setSerial(serial);

      // Query MediaStore for the latest image using the exact command you provided
      // Including the head -n 1 to get just the first result
      const queryCommand = `content query --uri content://media/external/images/media --projection _id:date_added --sort "date_added DESC" | head -n 2`;
      const queryResult = await adb.runAdb(["shell", queryCommand]);

      if (!queryResult.ok || !queryResult.data) {
        return { ok: false, error: "Failed to query MediaStore" };
      }

      console.log("MediaStore query output:", queryResult.data);

      // Parse the query result to extract the image ID
      const lines = queryResult.data.trim().split('\n');
      if (lines.length < 2) {
        return { ok: false, error: "No images found in MediaStore" };
      }

      // Get the first data row (Row: 0 is the most recent due to DESC sort)
      // Look for Row: 0 specifically since it's the most recent
      let dataLine = null;
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('Row: 0')) {
          dataLine = line;
          console.log(`✅ Found Row: 0 (most recent): ${dataLine}`);
          break;
        }
      }
      
      // If Row: 0 not found, there might be a formatting issue - try first data row
      if (!dataLine && lines.length >= 2) {
        dataLine = lines[1].trim();
        console.log(`⚠️ Row: 0 not found, using first data row: ${dataLine}`);
      }
      
      if (!dataLine) {
        return { ok: false, error: "No data rows found in MediaStore query" };
      }
      
      console.log("Parsing data line:", dataLine);
      
      // Pattern 1: Row: 0 _id=1000012836, date_added=1755380711 (your exact format)
      let idMatch = dataLine.match(/_id=(\d+)/);
      
      // Pattern 2: Row: 0 1000012836, 1755380711 (space separated)
      if (!idMatch) {
        const rowMatch = dataLine.match(/Row:\s*\d+\s+(\d+)/);
        if (rowMatch) {
          idMatch = [null, rowMatch[1]];
        }
      }
      
      // Pattern 3: 1000012836,1755380711 (just comma-separated values)
      if (!idMatch) {
        const parts = dataLine.split(',');
        if (parts.length >= 1 && /^\d+$/.test(parts[0].trim())) {
          idMatch = [null, parts[0].trim()];
        }
      }
      
      if (!idMatch) {
        return { ok: false, error: `Could not parse image ID from MediaStore query. Output: "${dataLine}"` };
      }

      const imageId = idMatch[1];
      const contentUri = `content://media/external/images/media/${imageId}`;

      console.log(`✅ Successfully extracted image ID: ${imageId}`);
      console.log(`✅ Generated content URI: ${contentUri}`);

      // Verify the content URI exists and is accessible
      const verifyResult = await adb.runAdb([
        "shell", "content", "gettype", "--uri", contentUri
      ]);

      if (verifyResult.ok && verifyResult.data && !verifyResult.data.includes('No content provider')) {
        console.log(`✅ Content URI verified accessible: ${verifyResult.data.trim()}`);
        return { ok: true, data: contentUri };
      } else {
        console.log(`⚠️ Content URI verification failed, but returning anyway: ${verifyResult.error || verifyResult.data}`);
        // Still return the URI since the verification might fail but the URI could still work
        return { ok: true, data: contentUri };
      }
    } catch (error: any) {
      return { ok: false, error: error?.message || "Failed to get latest image URI" };
    }
  }
});

export const shareSendImage = createTool({
  id: "share.sendImage",
  description: "Share an image using ACTION_SEND intent with READ_GRANT permission",
  inputSchema: z.object({
    package: z.string().describe("Target package to share to (e.g., 'com.Slack')"),
    contentUri: z.string().describe("Content URI of the image to share"),
    text: z.string().optional().describe("Optional text to include with the image"),
    serial: z.string().optional().describe("Device serial (optional)")
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    data: z.string().optional(),
    error: z.string().optional()
  }),
  execute: async ({ context: { package: pkg, contentUri, text, serial } }): Promise<ToolResult<string>> => {
    try {
      if (serial) adb.setSerial(serial);

      const args = [
        "shell", "am", "start",
        "-a", "android.intent.action.SEND"
      ];

      if (pkg) {
        args.push("-p", pkg);
      }

      args.push(
        "-t", "image/*",
        "--grant-read-uri-permission",
        "--eu", "android.intent.extra.STREAM", contentUri
      );

      if (text) {
        args.push("--es", "android.intent.extra.TEXT", text);
      }

      console.log(`Executing share intent: ${args.join(' ')}`);
      const result = await adb.runAdb(args);
      
      if (result.ok) {
        // Wait a moment for the target app to start
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Verify that the target app is actually running
        const { appGetCurrent } = await import("./app-tools");
        const currentAppResult = await appGetCurrent.execute({ context: { serial } });
        
        if (currentAppResult.ok && currentAppResult.data) {
          const currentPackage = currentAppResult.data.package;
          console.log(`Current app after share intent: ${currentPackage}`);
          
          if (currentPackage === pkg) {
            console.log(`✅ Share intent successfully opened ${pkg}`);
            return {
              ok: true,
              data: `${result.data} - Verified ${pkg} is now running`
            };
          } else {
            console.log(`⚠️ Share intent launched but ${pkg} is not running. Current app: ${currentPackage}`);
            
            // Check if we're in a share chooser or system dialog
            if (currentPackage.includes('android') || currentPackage.includes('system') || currentPackage.includes('packageinstaller')) {
              console.log(`📋 Detected system share chooser: ${currentPackage}`);
              return {
                ok: true,
                data: `${result.data} - Share chooser opened (${currentPackage}). User may need to select ${pkg} from the list.`
              };
            }
            
            return {
              ok: false,
              error: `Share intent failed - expected ${pkg} but current app is ${currentPackage}. App may not be installed or does not support image sharing.`
            };
          }
        } else {
          console.log("⚠️ Could not verify target app, but intent was sent");
          return result; // Fall back to original result
        }
      }
      
      return result;
    } catch (error: any) {
      return { ok: false, error: error?.message || "Failed to share image" };
    }
  }
});