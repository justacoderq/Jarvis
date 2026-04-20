#!/usr/bin/env tsx
import { executeGoalWithPhonePilot, executeSingleAction } from "../agents/control-agent";

/**
 * Demo A — Unlock with PIN
 * 
 * Flow:
 * 1. device.wake() → device.unlockWithSwipe()
 * 2. ui.dump() → find EditText for PIN or rely on keyboard focus
 * 3. input.typeText({ text: <PIN> }) then keyevent(66) (ENTER) or tap OK
 * 4. Verify home screen via ui.waitForText({ text: "Search", contains: true, timeoutMs: 3000 })
 */

export async function demoUnlockWithPin(pin: string, deviceSerial?: string) {
  console.log("🔓 Starting unlock with PIN demo...");
  
  try {
    const goal = `Unlock the phone with PIN "${pin}" and reach the home screen`;
    
    console.log(`Goal: ${goal}`);
    console.log(`Device: ${deviceSerial || 'auto-detect'}`);
    
    const result = await executeGoalWithPhonePilot(goal, 10, deviceSerial);
    
    if (result.success) {
      console.log("✅ Successfully unlocked phone!");
      console.log(`Completed in ${result.steps.length} steps`);
      console.log(`Summary: ${result.summary}`);
    } else {
      console.log("❌ Failed to unlock phone");
      console.log(`Status: ${result.status}`);
      console.log(`Error: ${result.error}`);
    }
    
    return result;
  } catch (error: any) {
    console.error("Demo failed:", error.message);
    return { success: false, error: error.message };
  }
}

// Manual step-by-step version for demonstration
export async function demoUnlockManualSteps(pin: string, deviceSerial?: string) {
  console.log("🔓 Starting manual unlock demo...");
  
  try {
    // Step 1: Wake device
    console.log("Step 1: Waking device...");
    let result = await executeSingleAction("deviceWake", {}, deviceSerial);
    if (!result.ok) {
      console.log("❌ Failed to wake device:", result.error);
      return { success: false, error: result.error };
    }
    console.log("✅ Device awakened");

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 2: Unlock with swipe
    console.log("Step 2: Unlocking with swipe...");
    result = await executeSingleAction("deviceUnlockWithSwipe", {}, deviceSerial);
    if (!result.ok) {
      console.log("❌ Failed to unlock with swipe:", result.error);
      return { success: false, error: result.error };
    }
    console.log("✅ Swipe unlock completed");

    // Wait for PIN screen
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 3: Type PIN
    console.log(`Step 3: Entering PIN ${pin}...`);
    result = await executeSingleAction("inputTypeText", { text: pin }, deviceSerial);
    if (!result.ok) {
      console.log("❌ Failed to type PIN:", result.error);
      return { success: false, error: result.error };
    }
    console.log("✅ PIN entered");

    // Step 4: Press ENTER
    console.log("Step 4: Pressing ENTER...");
    result = await executeSingleAction("deviceKeyevent", { codeOrName: "66" }, deviceSerial);
    if (!result.ok) {
      console.log("❌ Failed to press ENTER:", result.error);
      return { success: false, error: result.error };
    }
    console.log("✅ ENTER pressed");

    // Step 5: Wait for home screen
    console.log("Step 5: Waiting for home screen...");
    result = await executeSingleAction("uiWaitForText", { 
      text: "Search", 
      contains: true, 
      timeoutMs: 5000 
    }, deviceSerial);
    
    if (result.ok && result.data) {
      console.log("✅ Successfully reached home screen!");
      return { success: true, steps: 5 };
    } else {
      console.log("⚠️ PIN unlock completed but couldn't verify home screen");
      return { success: true, warning: "Home screen verification failed" };
    }

  } catch (error: any) {
    console.error("Manual demo failed:", error.message);
    return { success: false, error: error.message };
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const pin = args[0] || process.env.PHONE_PIN;
  const serial = args[1] || process.env.DEVICE_SERIAL;
  const mode = args[2] || "auto"; // "auto" or "manual"

  if (!pin) {
    console.error("Usage: tsx unlock.ts <PIN> [device_serial] [mode]");
    console.error("Or set PHONE_PIN environment variable");
    process.exit(1);
  }

  (async () => {
    if (mode === "manual") {
      await demoUnlockManualSteps(pin, serial);
    } else {
      await demoUnlockWithPin(pin, serial);
    }
  })();
}
