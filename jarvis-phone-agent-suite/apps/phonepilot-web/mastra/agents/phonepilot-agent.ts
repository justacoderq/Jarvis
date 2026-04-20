import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { PhonePilotExecutor } from "../exec/executor";
import * as ADB from "../tools/adb";
import { getPhonePilotTextModel } from "../providers/text-model";

// Import all ADB tools for the agent
const allAdbTools = {
  // Device tools
  deviceGetInfo: ADB.deviceGetInfo,
  deviceWake: ADB.deviceWake,
  deviceSleep: ADB.deviceSleep,
  deviceUnlockWithSwipe: ADB.deviceUnlockWithSwipe,
  deviceKeyevent: ADB.deviceKeyevent,
  
  // App tools
  appLaunch: ADB.appLaunch,
  appOpenUrl: ADB.appOpenUrl,
  appForceStop: ADB.appForceStop,
  appMonkeyLaunch: ADB.appMonkeyLaunch,
  appListInstalled: ADB.appListInstalled,
  appGetCurrent: ADB.appGetCurrent,
  
  // Input tools
  inputTap: ADB.inputTap,
  inputSwipe: ADB.inputSwipe,
  inputLongPress: ADB.inputLongPress,
  inputTypeText: ADB.inputTypeText,
  
  // UI tools
  uiDump: ADB.uiDump,
  uiParse: ADB.uiParse,
  uiFindByText: ADB.uiFindByText,
  uiFindByDesc: ADB.uiFindByDesc,
  uiFindByRes: ADB.uiFindByRes,
  uiTapNode: ADB.uiTapNode,
  uiWaitForText: ADB.uiWaitForText,
  
  // Media tools
  mediaScreenshot: ADB.mediaScreenshot,
  mediaRecordScreen: ADB.mediaRecordScreen,
  mediaLatestImageUri: ADB.mediaLatestImageUri,
  shareSendImage: ADB.shareSendImage,
  
  // Helper tools
  coordsScaleNormToDevice: ADB.coordsScaleNormToDevice,
  coordsCenter: ADB.coordsCenter
};

export const phonePilotAgent = new Agent({
  name: "PhonePilot",
  instructions: `
You are PhonePilot, an advanced Android automation agent using ADB tools. Your job is to achieve the user's goal safely and reliably by iteratively observing the device UI, selecting precise actions, executing them, and verifying outcomes.

CORE MISSION:
Convert natural-language goals into reliable, selector-first device operations using a robust Plan → Act → Observe → Verify (PAOV) loop.

CAPABILITIES:
- Goal-to-Plan: Convert user instruction to a step plan
- Selector-First Actions: Prefer acting by UI selectors (text/content-desc/resource-id) extracted from UIAutomator dump
- Pixel taps are fallback using normalized coords
- Closed-Loop Verification: After every action: re-dump UI (and/or screenshot if necessary) → verify expected state change → retry if needed
- Structured step logs with UI snapshots and success/failure signals

POLICY:
- Do not hardcode pixel coords; use selectors when possible
- Keep responses short; return structured JSON actions and evidence snippets
- Always prefer selector execution when a matching node exists
- After each action, verify via UI/text presence or focus change
- Operate with standard ADB permissions only (no rooting)

WORKFLOW LOOP:
1. Perceive: call ui.dump() and optionally media.screenshot(); summarize key elements
2. Plan: propose the next minimal action toward the goal
3. Act: call the appropriate tool
4. Verify: ensure the expected UI change or focus
5. Reflect: if failed, propose a recovery step; otherwise proceed

AVAILABLE TOOLS:
All the device, app, input, ui, media, and helper tools are available to you.

RESPONSE FORMAT:
- For each step, provide a clear rationale for your action choice
- On success, return status summary with evidence (texts found, focus changes, screenshots)
- On failure, return detailed error analysis and suggested recovery steps
- Use structured logging to track progress through complex flows

SPECIAL BEHAVIORS:
- For camera actions: use intent-based launches when possible
- For app sharing: properly handle content URIs and permissions
- For text input: escape special characters for ADB compatibility
- For navigation: prefer back/home key events over gesture when appropriate

Remember: You operate through precise, verifiable actions. Each step should move clearly toward the goal with measurable progress.
`,
  model: getPhonePilotTextModel(),
  tools: allAdbTools
});


// Convenience function to execute a goal using the executor system
export async function executeGoalWithPhonePilot(
  goal: string, 
  maxSteps?: number,
  deviceSerial?: string
) {
  // Smart default maxSteps based on goal complexity
  if (!maxSteps) {
    const goalLower = goal.toLowerCase();
    const navigationGoal =
      goalLower.includes('navigate') ||
      goalLower.includes('go to') ||
      goalLower.includes('open settings') ||
      goalLower.includes('wifi') ||
      goalLower.includes('wi-fi') ||
      goalLower.includes('settings');
    
    // Count complexity indicators
    const complexityScore = [
      goalLower.includes('open'),
      goalLower.includes('navigate') || goalLower.includes('go to'),
      goalLower.includes('flip') || goalLower.includes('switch'),
      goalLower.includes('take') || goalLower.includes('photo'),
      goalLower.includes('share') || goalLower.includes('send'),
      goalLower.includes('camera'),
      goalLower.includes('and')
    ].filter(Boolean).length;
    
    if (navigationGoal) {
      maxSteps = 10;
    }
    // Simple single-action goals
    else if (complexityScore <= 1) {
      maxSteps = 6;
    }
    // Medium complexity goals (3-4 complexity indicators)
    else if (complexityScore <= 4) {
      maxSteps = 10;
    }
    // Complex goals
    else {
      maxSteps = 18;
    }
  }
  
  console.log(`Executing goal: "${goal}" with maxSteps: ${maxSteps}`);
  
  const executor = new PhonePilotExecutor(deviceSerial);
  return await executor.executeGoal(goal, maxSteps, deviceSerial);
}

// Function for single-step tool execution (useful for testing)
export async function executeSingleAction(
  action: string,
  params: any,
  deviceSerial?: string
) {
  try {
    // Get the tool by name
    const tool = (allAdbTools as any)[action];
    if (!tool) {
      return { ok: false, error: `Unknown action: ${action}` };
    }

    // Execute with device serial
    const context = { ...params, serial: deviceSerial };
    return await tool.execute({ context });
  } catch (error: any) {
    return { ok: false, error: error?.message || "Action execution failed" };
  }
}
