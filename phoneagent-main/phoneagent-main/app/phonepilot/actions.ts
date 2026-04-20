"use server";

import { mastra } from "../../mastra";
import { executeGoalWithPhonePilot, executeSingleAction } from "../../mastra/agents/phonepilot-agent";
import { runAllDemos } from "../../mastra/demos";

export async function executeGoal(formData: FormData) {
  const goal = formData.get("goal")?.toString();
  const maxStepsInput = formData.get("maxSteps")?.toString();
  const deviceSerial = formData.get("deviceSerial")?.toString();

  if (!goal) {
    return { success: false, error: "Goal is required" };
  }

  try {
    // Only use explicit maxSteps if it's different from the default 20
    // This allows smart detection to work
    let maxSteps: number | undefined;
    if (maxStepsInput && maxStepsInput !== "20") {
      maxSteps = parseInt(maxStepsInput);
    }
    // If it's 20 or not specified, let smart detection handle it
    
    const result = await executeGoalWithPhonePilot(goal, maxSteps, deviceSerial);
    return result;
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function executeSingleAdbAction(formData: FormData) {
  const action = formData.get("action")?.toString();
  const params = formData.get("params")?.toString();
  const deviceSerial = formData.get("deviceSerial")?.toString();

  if (!action) {
    return { success: false, error: "Action is required" };
  }

  try {
    const parsedParams = params ? JSON.parse(params) : {};
    const result = await executeSingleAction(action, parsedParams, deviceSerial);
    return result;
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function runDemoSuite(formData: FormData) {
  const pin = formData.get("pin")?.toString();
  const channelName = formData.get("channelName")?.toString() || "general";
  const slackPackage = formData.get("slackPackage")?.toString() || "com.Slack";
  const deviceSerial = formData.get("deviceSerial")?.toString();
  const profileCount = parseInt(formData.get("profileCount")?.toString() || "3");

  try {
    const result = await runAllDemos({
      pin,
      channelName,
      slackPackage,
      deviceSerial,
      profileCount
    });
    return result;
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getDeviceInfo(formData: FormData) {
  const deviceSerial = formData.get("deviceSerial")?.toString();

  try {
    const result = await executeSingleAction("deviceGetInfo", {}, deviceSerial);
    return result;
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function takeScreenshot(formData: FormData) {
  const deviceSerial = formData.get("deviceSerial")?.toString();
  const path = formData.get("path")?.toString() || "/sdcard/phonepilot_ui.png";

  try {
    const result = await executeSingleAction("mediaScreenshot", { path }, deviceSerial);
    return result;
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function startScreenMirror(formData: FormData) {
  const quality = formData.get("quality")?.toString() || "medium";
  const deviceSerial = formData.get("deviceSerial")?.toString();

  try {
    // First, check if we have a connected device
    const deviceInfo = await executeSingleAction("deviceGetInfo", {}, deviceSerial);
    if (!deviceInfo.ok) {
      return { success: false, error: "No Android device found. Please connect device and enable USB debugging." };
    }

    // Start scrcpy with video-output to stream to web
    const { spawn } = require('child_process');
    const maxSize = quality === 'low' ? '360' : quality === 'medium' ? '720' : '1080';
    
    const scrcpyArgs = [
      '--max-size', maxSize,
      '--video-bit-rate', '8M',
      '--max-fps', '30',
      '--stay-awake',
      '--disable-screensaver',
      '--video-codec', 'h264',
      '--no-audio' // Disable audio for now to simplify
    ];

    // Add device serial if specified
    if (deviceSerial) {
      scrcpyArgs.push('--serial', deviceSerial);
    }

    // Launch scrcpy with desktop window for direct device control
    
    console.log('Starting scrcpy with args:', scrcpyArgs);
    
    const scrcpyProcess = spawn('scrcpy', scrcpyArgs, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let startupError = '';
    
    scrcpyProcess.stderr.on('data', (data: Buffer) => {
      const errorStr = data.toString();
      console.log('Scrcpy stderr:', errorStr);
      if (errorStr.includes('ERROR') || errorStr.includes('failed')) {
        startupError += errorStr;
      }
    });

    scrcpyProcess.stdout.on('data', (data: Buffer) => {
      console.log('Scrcpy stdout:', data.toString());
    });

    scrcpyProcess.on('error', (error: Error) => {
      console.error('Scrcpy process error:', error);
      throw new Error(`Failed to start scrcpy: ${error.message}`);
    });

    scrcpyProcess.on('exit', (code: number | null) => {
      console.log(`Scrcpy process exited with code ${code}`);
    });

    // Wait a moment for scrcpy to start
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    if (startupError) {
      throw new Error(`Scrcpy startup error: ${startupError}`);
    }

    // Store process ID globally for stopping later
    (global as any).scrcpyProcess = scrcpyProcess;

    return { 
      success: true, 
      message: "✅ Real Android screen mirroring started!",
      processId: scrcpyProcess.pid,
      info: "Scrcpy window opened - your phone screen is now mirrored"
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function stopScreenMirror() {
  try {
    // Terminate the scrcpy process
    if ((global as any).scrcpyProcess) {
      console.log('Stopping scrcpy process:', (global as any).scrcpyProcess.pid);
      (global as any).scrcpyProcess.kill('SIGTERM');
      
      // Give it a moment to terminate gracefully
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Force kill if still running
      if (!(global as any).scrcpyProcess.killed) {
        (global as any).scrcpyProcess.kill('SIGKILL');
      }
      
      (global as any).scrcpyProcess = null;
    }

    return { success: true, message: "Screen mirroring stopped" };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}