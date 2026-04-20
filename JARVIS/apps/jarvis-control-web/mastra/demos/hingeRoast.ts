#!/usr/bin/env tsx
import { executeGoalWithPhonePilot, executeSingleAction } from "../agents/control-agent";
import { generateHingeRoast } from "../agents/analyzer-agent";
import * as ADB from "../tools/adb";
import { readFile } from "fs/promises";

/**
 * Demo B — Hinge Roast
 * 
 * Flow:
 * 1. app.monkeyLaunch("co.hinge.app") → wait for inbox/home
 * 2. Loop 3–5 times: open a profile card, media.screenshot(), 
 *    send to Gemini for funny comment → overlay or log; input.swipe to next card
 * 3. Output a compiled "roast reel" (images + captions) in the UI
 */

interface RoastEntry {
  screenshot: string;
  roast: string;
  timestamp: number;
}

export async function demoHingeRoast(
  profileCount: number = 3,
  deviceSerial?: string
) {
  console.log("💘 Starting Hinge roast demo...");
  
  const roasts: RoastEntry[] = [];
  
  try {
    // Step 1: Launch Hinge app
    console.log("Step 1: Launching Hinge app...");
    let result = await executeSingleAction("appMonkeyLaunch", { 
      package: "co.hinge.app" 
    }, deviceSerial);
    
    if (!result.ok) {
      console.log("❌ Failed to launch Hinge:", result.error);
      return { success: false, error: result.error };
    }
    console.log("✅ Hinge launched");

    // Wait for app to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 2: Take initial screenshot to see current state
    console.log("Step 2: Taking initial screenshot...");
    const initialScreenshot = await executeSingleAction("mediaScreenshot", {
      path: "/sdcard/hinge_initial.png"
    }, deviceSerial);

    if (!initialScreenshot.ok) {
      console.log("❌ Failed to take initial screenshot:", initialScreenshot.error);
      return { success: false, error: initialScreenshot.error };
    }

    // Step 3: Loop through profiles
    console.log(`Step 3: Processing ${profileCount} profiles...`);
    
    for (let i = 0; i < profileCount; i++) {
      console.log(`\n--- Profile ${i + 1}/${profileCount} ---`);
      
      try {
        // Take screenshot of current profile
        const screenshotPath = `/sdcard/hinge_profile_${i + 1}.png`;
        const screenshotResult = await executeSingleAction("mediaScreenshot", {
          path: screenshotPath
        }, deviceSerial);

        if (screenshotResult.ok) {
          console.log(`📸 Screenshot taken: ${screenshotPath}`);
          
          // Get device info for pulling screenshot
          const deviceInfo = await executeSingleAction("deviceGetInfo", {}, deviceSerial);
          
          // Pull screenshot to local machine for analysis
          // Note: In a real implementation, you'd pull the file from device
          // For now, we'll simulate with the path
          try {
            // Generate roast using Gemini
            console.log("🤖 Generating roast...");
            
            // For demo purposes, we'll use a placeholder base64
            // In real implementation, pull the file and convert to base64
            const mockBase64 = "placeholder_base64_image_data";
            const roast = await generateHingeRoast(mockBase64);
            
            console.log(`🔥 Roast generated: "${roast}"`);
            
            roasts.push({
              screenshot: screenshotPath,
              roast,
              timestamp: Date.now()
            });
            
          } catch (error: any) {
            console.log(`⚠️ Failed to generate roast for profile ${i + 1}:`, error.message);
            roasts.push({
              screenshot: screenshotPath,
              roast: "Failed to generate roast - but I'm sure they're roastable!",
              timestamp: Date.now()
            });
          }
        }

        // Swipe to next profile (except on last iteration)
        if (i < profileCount - 1) {
          console.log("👆 Swiping to next profile...");
          
          // Get device dimensions for swipe calculation
          const deviceInfoResult = await executeSingleAction("deviceGetInfo", {}, deviceSerial);
          let width = 1080, height = 2340; // defaults
          
          if (deviceInfoResult.ok && deviceInfoResult.data) {
            width = deviceInfoResult.data.width;
            height = deviceInfoResult.data.height;
          }

          // Swipe left (reject) to go to next profile
          const swipeResult = await executeSingleAction("inputSwipe", {
            x1: Math.floor(width * 0.8),   // Start near right edge
            y1: Math.floor(height * 0.5),  // Middle of screen
            x2: Math.floor(width * 0.2),   // End near left edge
            y2: Math.floor(height * 0.5),  // Same Y
            durationMs: 300
          }, deviceSerial);

          if (swipeResult.ok) {
            console.log("✅ Swiped to next profile");
            // Wait for next profile to load
            await new Promise(resolve => setTimeout(resolve, 2000));
          } else {
            console.log("⚠️ Swipe failed:", swipeResult.error);
          }
        }

      } catch (error: any) {
        console.log(`❌ Error processing profile ${i + 1}:`, error.message);
      }
    }

    // Step 4: Compile and display roast reel
    console.log("\n🎭 ROAST REEL COMPILATION 🎭");
    console.log("=" * 50);
    
    roasts.forEach((roast, index) => {
      console.log(`\nProfile ${index + 1}:`);
      console.log(`📸 Screenshot: ${roast.screenshot}`);
      console.log(`🔥 Roast: "${roast.roast}"`);
      console.log(`⏰ Time: ${new Date(roast.timestamp).toLocaleTimeString()}`);
      console.log("-" * 30);
    });

    console.log(`\n✅ Successfully roasted ${roasts.length} profiles!`);
    
    return { 
      success: true, 
      roastCount: roasts.length,
      roasts 
    };

  } catch (error: any) {
    console.error("Hinge roast demo failed:", error.message);
    return { 
      success: false, 
      error: error.message,
      roasts 
    };
  }
}

// Automated version using the goal-based executor
export async function demoHingeRoastAutomated(
  profileCount: number = 3,
  deviceSerial?: string
) {
  console.log("💘 Starting automated Hinge roast demo...");
  
  try {
    const goal = `Open Hinge app, capture screenshots of ${profileCount} profiles with roasts, and create a roast reel`;
    
    console.log(`Goal: ${goal}`);
    console.log(`Device: ${deviceSerial || 'auto-detect'}`);
    
    const result = await executeGoalWithPhonePilot(goal, 20, deviceSerial);
    
    if (result.success) {
      console.log("✅ Successfully completed Hinge roast demo!");
      console.log(`Completed in ${result.steps.length} steps`);
      console.log(`Summary: ${result.summary}`);
    } else {
      console.log("❌ Failed to complete Hinge roast demo");
      console.log(`Status: ${result.status}`);
      console.log(`Error: ${result.error}`);
    }
    
    return result;
  } catch (error: any) {
    console.error("Automated demo failed:", error.message);
    return { success: false, error: error.message };
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const profileCount = parseInt(args[0]) || 3;
  const serial = args[1] || process.env.DEVICE_SERIAL;
  const mode = args[2] || "manual"; // "manual" or "auto"

  console.log(`Roasting ${profileCount} profiles...`);

  (async () => {
    if (mode === "auto") {
      await demoHingeRoastAutomated(profileCount, serial);
    } else {
      await demoHingeRoast(profileCount, serial);
    }
  })();
}
