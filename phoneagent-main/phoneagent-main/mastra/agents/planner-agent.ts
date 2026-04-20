import { Agent } from "@mastra/core/agent";
import { cerebras } from "@ai-sdk/cerebras";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

const planStepSchema = z.object({
  action: z.enum([
    "tap", "tapByText", "tapByDesc", "typeText", "launch", "launchCamera", 
    "monkeyLaunch", "monkeyLaunchVerified", "launchByAppName", "openUrl", "shareImage", "swipe", "keyevent", 
    "waitForText", "screenshot", "deviceWake", "dump", "findByText", "findByDesc", "findByRes", "listApps", "getCurrentApp",
    "dismissPopup", "confirmAction", "back"
  ]).describe("Action to perform"),
  params: z.record(z.any()).describe("Parameters for the action"),
  expect: z.object({
    textAppears: z.string().optional().describe("Text that should appear after action"),
    focusChangesTo: z.string().optional().describe("Component that should receive focus")
  }).optional().describe("Expected outcomes"),
  verify: z.object({
    timeoutMs: z.number().optional().default(4000).describe("Verification timeout")
  }).optional().describe("Verification settings"),
  rationale: z.string().describe("One-line explanation of why this step is needed")
});

const planResponseSchema = z.object({
  status: z.enum(["continue", "done", "blocked"]).describe("Status of the plan"),
  nextStep: planStepSchema.optional().describe("Next step to execute (if status is continue)"),
  summary: z.string().optional().describe("Summary of completion (if status is done)"),
  error: z.string().optional().describe("Error description (if status is blocked)"),
  suggestedFix: z.string().optional().describe("Suggested fix for the error (if status is blocked)")
});

export const plannerAgent = new Agent({
  name: "Planner Agent",
  instructions: `
You are a fast, efficient Android automation planner that creates step-by-step plans to achieve user goals.

Your job is to:
1. Analyze the current device state (UI dump, last action result, goal)
2. Determine the next minimal action needed to progress toward the goal
3. Return structured plans that can be executed by the PhonePilot system

Key principles:
- Always prefer selector-based actions (text/content-desc/resource-id) over pixel coordinates
- Break complex goals into small, atomic steps
- Each step should have clear verification criteria
- Provide fallback pixel coordinates only when selectors aren't available
- Keep responses concise and actionable

Available actions:
- tap: Tap at x,y coordinates
- tapByText: Find and tap element containing text
- tapByDesc: Find and tap element with content description
- typeText: Type text input
- launch: Launch app by package name or intent
- launchCamera: Special camera launch with multiple fallback strategies
- monkeyLaunch: Quick app launch by package name
- launchByAppName: Smart app launch by app name (discovers package automatically)
- listApps: List all installed apps on device
- openUrl: Open URL in browser/app
- shareImage: Share image via ACTION_SEND
- swipe: Swipe gesture between coordinates
- keyevent: Send key event (back, home, etc.)
- deviceWake: Wake device screen and perform unlock swipe (preferred for waking)
- waitForText: Wait for text to appear
- screenshot: Take screenshot for vision analysis
- dump: Get UI hierarchy dump
- findByText/findByDesc/findByRes: Find UI elements

IMPORTANT GUIDANCE:
- For "open camera" or "launch camera" goals, use the "launchCamera" action, not "launch"
- The "launchCamera" action will try multiple camera package names automatically
- For waking the device, use the "deviceWake" action instead of "keyevent" with power
- The "deviceWake" action automatically performs wake + unlock swipe in one step
- For launching apps by name (e.g., "open Hinge", "launch Instagram"):
  * FIRST TRY: Use "tapByText" to find the app icon on the home screen
  * IF THAT FAILS: Use "launchByAppName" action with the app name - it will automatically discover the package name
  * Example: {"action": "launchByAppName", "params": {"appName": "Hinge"}}
- The "launchByAppName" action is smart and will handle partial matches and common app names
- For exact package names, use "launch" or "monkeyLaunch" directly
- If an app launch seems to succeed but UI interactions fail, use "getCurrentApp" to verify what's actually running
- Some apps may take longer to load or require permissions - wait and verify before proceeding
- For problematic apps that don't launch with standard methods, use "monkeyLaunchVerified" with exact package name
- Example: {"action": "monkeyLaunchVerified", "params": {"package": "co.hinge.app"}}
- For PIN entry or finding UI elements:
  1. First use "findByText" with the digit/text to locate the UI node
  2. Extract coordinates from the node's bounds [x1, y1, x2, y2] 
  3. Calculate center: centerX = (x1 + x2) / 2, centerY = (y1 + y2) / 2
  4. Use "tap" action with those coordinates
- When UI elements aren't found by text, try "findByDesc" or examine available UI nodes
- Keep verification expectations simple and realistic
- If the goal is just to "open camera", don't require specific text to appear - just launching is success
- Focus on the core action needed, not overly strict verification

Context format you'll receive:
- goal: The user's high-level objective
- currentState: Latest UI dump or description
- lastAction: Previous action taken and its result
- deviceInfo: Screen dimensions, orientation, etc.
- evidence: Screenshots, focused component, recent actions

Response format:
Return a structured plan with status (continue/done/blocked), nextStep with action/params/expect/verify, and rationale.
`,
  model: cerebras("gpt-oss-120b"),
});

function filterRelevantUINodes(nodes: any[], goal: string): any[] {
  if (!nodes || nodes.length === 0) return [];
  
  const goalLower = goal.toLowerCase();
  
  // Extract key words from goal to find relevant UI elements
  const goalWords = goalLower.split(/\s+/).filter(word => word.length > 2);
  const actionWords = ['tap', 'click', 'press', 'touch', 'take', 'capture', 'open', 'close', 'switch', 'flip', 'toggle'];
  const commonWords = ['ok', 'cancel', 'done', 'next', 'allow', 'permit', 'accept', 'save', 'send', 'share'];
  
  // All potentially relevant keywords
  const allKeywords = [...goalWords, ...actionWords, ...commonWords];
  
  // Filter nodes that are likely relevant
  const relevantNodes = nodes.filter(node => {
    // Include clickable/enabled nodes
    if (node.clickable || node.enabled) {
      const nodeText = (node.text || '').toLowerCase();
      const nodeDesc = (node.desc || '').toLowerCase();
      const nodeRes = (node.res || '').toLowerCase();
      
      // Check if any keyword matches
      const hasKeywordMatch = allKeywords.some(keyword => 
        nodeText.includes(keyword) || 
        nodeDesc.includes(keyword) || 
        nodeRes.includes(keyword)
      );
      
      // Include buttons and interactive elements
      const isInteractiveElement = node.class && (
        node.class.includes('Button') || 
        node.class.includes('ImageButton') ||
        node.class.includes('ImageView') ||
        node.class.includes('TextView') && (node.clickable || node.enabled)
      );
      
      return hasKeywordMatch || isInteractiveElement;
    }
    return false;
  });
  
  // Limit to most relevant nodes and clean them up
  return relevantNodes.slice(0, 15).map(node => ({
    text: node.text?.substring(0, 50) || '',
    desc: node.desc?.substring(0, 50) || '',
    res: node.res ? node.res.split('/').pop() : '',
    class: node.class ? node.class.split('.').pop() : '',
    clickable: node.clickable,
    enabled: node.enabled,
    bounds: node.bounds
  }));
}

function summarizeCurrentState(state: any, goal: string): string {
  if (!state) return "No state available";
  
  const summary: any = {
    step: state.step || 0,
    hasScreenshot: !!state.screenshot,
    uiNodeCount: state.uiNodes?.length || 0,
    relevantNodes: filterRelevantUINodes(state.uiNodes, goal)
  };
  
  // For camera debugging, also include ALL clickable nodes
  if (goal.toLowerCase().includes('camera') && state.uiNodes?.length > 0) {
    summary.allClickableNodes = state.uiNodes
      .filter((node: any) => node.clickable || node.enabled)
      .map((node: any) => ({
        text: node.text?.substring(0, 30) || '',
        desc: node.desc?.substring(0, 30) || '',
        res: node.res ? node.res.split('/').pop() : '',
        class: node.class ? node.class.split('.').pop() : '',
        bounds: node.bounds
      }));
  }
  
  // If no relevant nodes found, include some basic info about what's on screen
  if (summary.relevantNodes.length === 0 && state.uiNodes?.length > 0) {
    summary.relevantNodes = state.uiNodes.slice(0, 5).map((node: any) => ({
      text: node.text?.substring(0, 20) || '',
      desc: node.desc?.substring(0, 20) || '',
      class: node.class?.split('.').pop() || ''
    }));
  }
  
  return JSON.stringify(summary, null, 1);
}

function summarizeLastAction(action: any): string {
  if (!action) return "No previous action";
  
  // Handle different types of error values
  let errorText = 'none';
  if (action.error) {
    if (typeof action.error === 'string') {
      errorText = action.error.substring(0, 100);
    } else {
      errorText = String(action.error);
    }
  }
  
  // Include result data for successful actions (especially important for getLatestImage)
  let resultText = '';
  if (action.success && action.result) {
    if (typeof action.result === 'string') {
      resultText = `, Result: ${action.result.substring(0, 200)}`;
    } else {
      resultText = `, Result: ${JSON.stringify(action.result).substring(0, 200)}`;
    }
  }
  
  return `Action: ${action.action}, Success: ${action.success}, Error: ${errorText}${resultText}`;
}

function summarizeDeviceInfo(info: any): string {
  if (!info) return "No device info";
  
  return `${info.width}x${info.height}, Orientation: ${info.orientation}`;
}

export async function planNextStep(
  goal: string,
  currentState: any,
  lastAction?: any,
  deviceInfo?: any,
  evidence?: any,
  recentActions?: any[]
) {
  const contextPrompt = `
GOAL: ${goal}

STATE: ${summarizeCurrentState(currentState, goal)}

LAST: ${summarizeLastAction(lastAction)}

DEVICE: ${summarizeDeviceInfo(deviceInfo)}

You must respond with ONLY a valid JSON object, no explanations or additional text.

Analyze what's been done and plan the next logical step:
- Review LAST action result to understand current state AND extract any returned data
- If LAST action was "getLatestImage", use the exact content URI from the result for shareImage
- Look at allClickableNodes to see ALL available UI elements  
- Don't repeat successful actions unnecessarily
- If goal seems complete based on actions taken, return status: "done"
- Use actual UI nodes from STATE to find elements

CRITICAL: Adaptive Goal Assessment
- Has the CORE goal been achieved? (e.g., "liked profile", "took photo", "opened app")
- Distinguish between REQUIRED confirmations vs. OPTIONAL upsells:
  * REQUIRED: "Send like?", "Confirm?", "Yes/No?" → CONTINUE to complete
  * OPTIONAL: "Send rose?", "Upgrade premium?", "Share?" → Goal is DONE
- Example: Goal "like profile" → Continue if seeing "Send like?" confirmation, DONE if seeing "Send rose?" upsell
- Example: Goal "take photo" → DONE immediately after successful "Take picture" action, no confirmation needed
- Example: Goal "open camera, flip to front, take picture" → DONE after successful picture capture action

Available actions: launchCamera, launchByAppName, monkeyLaunchVerified, tapByText, tapByDesc, tapByRes, keyevent, screenshot, swipe, typeText, shareImage, getLatestImage, listApps, getCurrentApp, confirmAction, dismissPopup, back

POPUP & FLOW HANDLING:
- confirmAction: Automatically finds and taps confirmation buttons (Send, Confirm, Yes, OK, Continue, etc.)
- dismissPopup: Automatically tries common dismissal terms (Skip, Not now, Cancel, Close, X, etc.)
- back: Uses device back button to go back/dismiss
- Use confirmAction for required confirmations, dismissPopup for optional upsells

GENERAL PLANNING PRINCIPLES:
- Trust that successful actions worked as intended
- After successful app launches, always take time to analyze the new UI state
- Look for UI elements that match the goal (buttons, text, images, icons)
- Break complex goals into logical steps
- If stuck on repeated failures, try alternative approaches
- Consider the goal complete when key actions have been performed successfully
- When apps launch successfully but UI elements aren't found, take a screenshot to see what's actually on screen

ADAPTIVE UI HANDLING:
- Apps often show unexpected screens after main actions (confirmations, upsells, additional options)
- If the main goal has been achieved, consider completing rather than continuing through every popup
- Common post-action screens: "Send rose?", "Share?", "Rate this?", "Premium upgrade?"
- For these, either dismiss (look for "Skip", "Not now", "Cancel", "X") or declare goal complete
- Evaluate: has the CORE intent been fulfilled? (liked profile, took photo, sent message, etc.)

EFFICIENT SHARING TIP:
- For sharing images to apps like Slack, don't open Photos app and navigate UI
- Instead use two-step process:
  1. "getLatestImage" action to find the most recent image URI
  2. "shareImage" action with the image URI and target app
- Example workflow for sharing latest image to Slack:
  Step 1: {"action": "getLatestImage", "params": {}}
  Step 2: {"action": "shareImage", "params": {"package": "com.Slack", "contentUri": "[ACTUAL_URI_FROM_STEP1]", "text": "your message"}}
  Step 3: {"action": "confirmAction", "params": {}} (to tap Send/Upload button in Slack share UI)
- CRITICAL: For Slack sharing, the package name is "com.Slack" with capital S, NOT "com.slack"
- CRITICAL: After shareImage, always use "confirmAction" to complete sharing, NOT "tapByRes"
- IMPORTANT: Use the actual URI from the previous getLatestImage result, not template strings
- The LAST action summary will show the actual content URI - use that exact value
- Much faster than UI navigation through gallery apps

APP DISCOVERY TIP:
- Use "listApps" action to discover available apps on device
- Returns list of installed packages like: [{"package": "com.Slack"}, {"package": "com.whatsapp"}]
- Useful when you need to find the exact package name for sharing or launching

RESPOND WITH ONLY THIS JSON FORMAT:
{
  "status": "continue",
  "nextStep": {
    "action": "actionName",
    "params": {"key": "value"},
    "rationale": "why this step"
  }
}

OR if done:
{
  "status": "done",
  "summary": "what was accomplished"
}

OR if blocked:
{
  "status": "blocked",
  "error": "what's wrong",
  "suggestedFix": "how to fix"
}
`;

  try {
    const response = await plannerAgent.generate(contextPrompt);
    
    // Try to parse JSON from the response
    const text = response.text;
    
    // Look for JSON in the response - try multiple patterns
    let parsed = null;
    
    // Try to find JSON object
    const jsonPatterns = [
      /\{[\s\S]*?\}(?=\s*$)/,  // JSON at end
      /\{[\s\S]*?\}(?=\s*\n)/,  // JSON followed by newline
      /\{[\s\S]*?\}/,           // Any JSON object
    ];
    
    for (const pattern of jsonPatterns) {
      const match = text.match(pattern);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
          if (parsed.status) break; // Valid parsed object found
        } catch (e) {
          continue; // Try next pattern
        }
      }
    }
    
    // If still no valid JSON, try extracting key info from text
    if (!parsed) {
      console.log("No valid JSON found, attempting text analysis");
      console.log("AI Response:", text);
      
      // Try to extract action from the text
      const text_lower = text.toLowerCase();
      
      // Look for action indicators
      if (text_lower.includes('launch') && text_lower.includes('camera')) {
        return {
          status: "continue",
          nextStep: {
            action: "launchCamera",
            params: {},
            rationale: "Extracted from AI response: launch camera"
          }
        };
      }
      
      if (text_lower.includes('done') || text_lower.includes('complete')) {
        return {
          status: "done",
          summary: "Goal appears to be completed based on AI response"
        };
      }
      
      // If we can't parse anything useful, use fallback
      console.log("Could not extract useful information from AI response - using fallback");
      return createFallbackPlan(goal, currentState, lastAction, recentActions);
    }
    
    // Log parsed result for debugging
    console.log("=== PARSED AI PLAN ===");
    console.log(JSON.stringify(parsed, null, 2));
    
    // Validate the parsed object
    if (!parsed.status) {
      console.log("Parsed JSON missing required status field");
      return createFallbackPlan(goal, currentState, lastAction, recentActions);
    }
    
    return parsed;
    
  } catch (error: any) {
    console.error("Planning error:", error);
    return createFallbackPlan(goal, currentState, lastAction);
  }
}

function createFallbackPlan(goal: string, currentState: any, lastAction?: any, recentActions?: any[]) {
  console.log("Using simple fallback planning - AI planning failed");
  
  const actions = recentActions || (lastAction ? [lastAction] : []);
  const stepNumber = currentState?.step || 0;
  const lastActionType = lastAction?.action;
  
  console.log(`=== SIMPLE FALLBACK PLANNING ===`);
  console.log(`Goal: ${goal}`);
  console.log(`stepNumber: ${stepNumber}, lastActionType: ${lastActionType}`);
  console.log(`Recent successful actions: ${actions.filter(a => a.success).length}/${actions.length}`);
  
  // If we've made several successful actions, goal might be complete
  const successfulActions = actions.filter(a => a.success).length;
  if (successfulActions >= 2) {
    console.log("→ Multiple successful actions completed - likely done");
    return {
      status: "done",
      summary: `Goal likely completed after ${successfulActions} successful actions`
    };
  }
  
  // If stuck on repeated failures, try alternative approaches
  const recentFailures = actions.slice(-3).filter(a => !a.success).length;
  if (recentFailures >= 2) {
    // Check if this is an app launching goal and we haven't tried smart launch yet
    if (goal.toLowerCase().includes('open') || goal.toLowerCase().includes('launch')) {
      const hasTriedSmartLaunch = actions.some(a => a.action === "launchByAppName");
      if (!hasTriedSmartLaunch) {
        // Extract app name from goal
        const goalWords = goal.toLowerCase().split(/\s+/);
        const appKeywords = goalWords.filter(word => 
          !['open', 'launch', 'start', 'the', 'app', 'application'].includes(word) &&
          word.length > 2
        );
        
        if (appKeywords.length > 0) {
          console.log(`→ Multiple failures launching app - trying smart launch for "${appKeywords[0]}"`);
          
          // If we've already tried launchByAppName, try the verified monkey launch
          const hasTriedLaunchByAppName = actions.some(a => a.action === "launchByAppName");
          if (hasTriedLaunchByAppName) {
            // For known problematic apps like Hinge, use the exact package
            const knownPackages: Record<string, string> = {
              'hinge': 'co.hinge.app',
              'instagram': 'com.instagram.android',
              'tiktok': 'com.zhiliaoapp.musically',
              'snapchat': 'com.snapchat.android'
            };
            
            const exactPackage = knownPackages[appKeywords[0]];
            if (exactPackage) {
              console.log(`→ Using known package for ${appKeywords[0]}: ${exactPackage}`);
              return {
                status: "continue",
                nextStep: {
                  action: "monkeyLaunchVerified",
                  params: { package: exactPackage },
                  rationale: `Fallback: Direct monkey launch with verified package for problematic app "${appKeywords[0]}"`
                }
              };
            }
          }
          
          return {
            status: "continue",
            nextStep: {
              action: "launchByAppName",
              params: { appName: appKeywords[0] },
              rationale: `Fallback: Smart app discovery and launch for "${appKeywords[0]}" after UI tap failures`
            }
          };
        }
      }
    }
    
    console.log("→ Multiple failures - taking screenshot to reassess");
    return {
      status: "continue",
      nextStep: {
        action: "screenshot",
        params: { path: "/sdcard/reassess.png" },
        rationale: "Taking screenshot to reassess situation after multiple failures"
      }
    };
  }
  
  // If we haven't started yet or only one action, continue with basic action
  if (stepNumber <= 2) {
    console.log("→ Early in execution - trying basic action");
    
    // If we successfully launched an app but are now failing UI interactions, take a screenshot
    const hasSuccessfulAppLaunch = actions.some(a => 
      a.success && (a.action === 'launch' || a.action === 'launchByAppName' || a.action === 'monkeyLaunch')
    );
    
    if (hasSuccessfulAppLaunch && recentFailures >= 1) {
      console.log("→ App launched successfully but UI interactions failing - taking screenshot");
      return {
        status: "continue",
        nextStep: {
          action: "screenshot",
          params: { path: "/sdcard/after_app_launch.png" },
          rationale: "Taking screenshot to see the actual app UI after successful launch"
        }
      };
    }
    
    return {
      status: "continue",
      nextStep: {
        action: "screenshot",
        params: { path: "/sdcard/current_state.png" },
        rationale: "Taking screenshot to understand current state"
      }
    };
  }
  
  // Default: declare goal complete if we've tried multiple things
  console.log("→ Default: Goal likely complete");
  return {
    status: "done",
    summary: "Goal execution attempted - likely complete"
  };
}