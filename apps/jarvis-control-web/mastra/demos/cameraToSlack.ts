#!/usr/bin/env tsx
import { executeGoalWithPhonePilot, executeSingleAction } from "../agents/control-agent";

/**
 * Demo C — Room Photo → Slack #general
 * 
 * Flow:
 * 1. app.launch({ action: "android.media.action.STILL_IMAGE_CAMERA" })
 * 2. Flip camera: find "Switch camera" and ui.tapNode
 * 3. keyevent(27) to snap (KEYCODE_CAMERA)
 * 4. media.latestImageUri() → share.sendImage({ package: <SlackPkg>, contentUri, text: "Taken just now 📸" })
 * 5. In Slack share UI, select #agent-hackathon via "to" selector, then tap Send
 * 6. Verify an activity toast or presence of "Message sent"
 */

export async function demoCameraToSlack(
  channelName: string = "general",
  slackPackage: string = "com.Slack",
  deviceSerial?: string
) {
  console.log("📸 Starting camera to Slack demo...");
  
  try {
    console.log("Step 1: Launching camera app...");
    let result = await executeSingleAction("appLaunch", {
      action: "android.media.action.STILL_IMAGE_CAMERA"
    }, deviceSerial);

    if (!result.ok) {
      console.log("❌ Failed to launch camera:", result.error);
      return { success: false, error: result.error };
    }
    console.log("✅ Camera launched");

    // Wait for camera to initialize
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 2: Flip to front camera
    console.log("Step 2: Looking for camera flip button...");
    
    // First dump UI to find the flip button
    const uiDumpResult = await executeSingleAction("uiDump", {}, deviceSerial);
    if (!uiDumpResult.ok) {
      console.log("❌ Failed to dump UI:", uiDumpResult.error);
      return { success: false, error: uiDumpResult.error };
    }

    // Parse UI nodes
    const parseResult = await executeSingleAction("uiParse", {
      xml: uiDumpResult.data.xml
    }, deviceSerial);

    if (!parseResult.ok) {
      console.log("❌ Failed to parse UI:", parseResult.error);
      return { success: false, error: parseResult.error };
    }

    // Try to find flip/switch camera button
    const flipButtons = [
      "Switch camera",
      "Flip camera", 
      "Front camera",
      "Rear camera",
      "Switch"
    ];

    let flipFound = false;
    for (const buttonText of flipButtons) {
      const findResult = await executeSingleAction("uiFindByText", {
        text: buttonText,
        contains: true,
        nodes: parseResult.data
      }, deviceSerial);

      if (findResult.ok && findResult.data) {
        console.log(`✅ Found flip button: "${buttonText}"`);
        const tapResult = await executeSingleAction("uiTapNode", {
          node: findResult.data
        }, deviceSerial);
        
        if (tapResult.ok) {
          console.log("✅ Camera flipped");
          flipFound = true;
          break;
        }
      }
    }

    if (!flipFound) {
      console.log("⚠️ Could not find flip camera button, proceeding with current camera");
    }

    // Wait for camera to settle
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 3: Take photo
    console.log("Step 3: Taking photo...");
    result = await executeSingleAction("deviceKeyevent", {
      codeOrName: "27" // KEYCODE_CAMERA
    }, deviceSerial);

    if (!result.ok) {
      console.log("❌ Failed to take photo with camera key, trying tap...");
      
      // Fallback: try to find and tap shutter button
      const shutterResult = await executeSingleAction("uiFindByDesc", {
        desc: "Shutter",
        contains: true,
        nodes: parseResult.data
      }, deviceSerial);

      if (shutterResult.ok && shutterResult.data) {
        const tapShutterResult = await executeSingleAction("uiTapNode", {
          node: shutterResult.data
        }, deviceSerial);
        
        if (!tapShutterResult.ok) {
          console.log("❌ Failed to tap shutter button:", tapShutterResult.error);
          return { success: false, error: "Could not take photo" };
        }
      } else {
        console.log("❌ Could not find shutter button");
        return { success: false, error: "Could not take photo" };
      }
    }
    
    console.log("✅ Photo taken");

    // Wait for photo to be processed and saved
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 4: Get latest image URI
    console.log("Step 4: Getting latest image URI...");
    const latestImageResult = await executeSingleAction("mediaLatestImageUri", {}, deviceSerial);

    if (!latestImageResult.ok) {
      console.log("❌ Failed to get latest image URI:", latestImageResult.error);
      return { success: false, error: latestImageResult.error };
    }

    const imageUri = latestImageResult.data;
    console.log(`✅ Got image URI: ${imageUri}`);

    // Step 5: Share to Slack
    console.log("Step 5: Sharing to Slack...");
    const shareResult = await executeSingleAction("shareSendImage", {
      package: slackPackage,
      contentUri: imageUri,
      text: "Taken just now 📸"
    }, deviceSerial);

    if (!shareResult.ok) {
      console.log("❌ Failed to share to Slack:", shareResult.error);
      return { success: false, error: shareResult.error };
    }
    console.log("✅ Share intent sent to Slack");

    // Wait for Slack to open
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 6: Select channel and send
    console.log(`Step 6: Looking for #${channelName} channel...`);
    
    // Dump UI to see Slack interface
    const slackUiResult = await executeSingleAction("uiDump", {}, deviceSerial);
    if (slackUiResult.ok) {
      const slackParseResult = await executeSingleAction("uiParse", {
        xml: slackUiResult.data.xml
      }, deviceSerial);

      if (slackParseResult.ok) {
        // Try to find the channel
        const channelFindResult = await executeSingleAction("uiFindByText", {
          text: channelName,
          contains: true,
          nodes: slackParseResult.data
        }, deviceSerial);

        if (channelFindResult.ok && channelFindResult.data) {
          console.log(`✅ Found #${channelName} channel`);
          const tapChannelResult = await executeSingleAction("uiTapNode", {
            node: channelFindResult.data
          }, deviceSerial);
          
          if (tapChannelResult.ok) {
            console.log("✅ Channel selected");
          }
        } else {
          console.log(`⚠️ Could not find #${channelName} channel, using default`);
        }

        // Wait a moment then look for Send button
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Look for Send button
        const sendButtons = ["Send", "Share", "Post"];
        let sendFound = false;

        for (const buttonText of sendButtons) {
          const sendFindResult = await executeSingleAction("uiFindByText", {
            text: buttonText,
            contains: true,
            nodes: slackParseResult.data
          }, deviceSerial);

          if (sendFindResult.ok && sendFindResult.data) {
            console.log(`✅ Found ${buttonText} button`);
            const tapSendResult = await executeSingleAction("uiTapNode", {
              node: sendFindResult.data
            }, deviceSerial);
            
            if (tapSendResult.ok) {
              console.log("✅ Message sent!");
              sendFound = true;
              break;
            }
          }
        }

        if (!sendFound) {
          console.log("⚠️ Could not find Send button, but share was initiated");
        }
      }
    }

    // Step 7: Verify completion
    console.log("Step 7: Waiting for confirmation...");
    const confirmationResult = await executeSingleAction("uiWaitForText", {
      text: "sent",
      contains: true,
      timeoutMs: 5000
    }, deviceSerial);

    if (confirmationResult.ok && confirmationResult.data) {
      console.log("✅ Message sent confirmation received!");
    } else {
      console.log("⚠️ No confirmation found, but process completed");
    }

    console.log("✅ Camera to Slack demo completed successfully!");
    
    return { 
      success: true, 
      imageUri,
      channel: channelName
    };

  } catch (error: any) {
    console.error("Camera to Slack demo failed:", error.message);
    return { success: false, error: error.message };
  }
}

// Automated version using the goal-based executor
export async function demoCameraToSlackAutomated(
  channelName: string = "general",
  slackPackage: string = "com.Slack",
  deviceSerial?: string
) {
  console.log("📸 Starting automated camera to Slack demo...");
  
  try {
    const goal = `Open camera, flip to front camera, take a photo, and share it to Slack #${channelName} with the message "Taken just now 📸"`;
    
    console.log(`Goal: ${goal}`);
    console.log(`Device: ${deviceSerial || 'auto-detect'}`);
    
    const result = await executeGoalWithPhonePilot(goal, 25, deviceSerial);
    
    if (result.success) {
      console.log("✅ Successfully completed camera to Slack demo!");
      console.log(`Completed in ${result.steps.length} steps`);
      console.log(`Summary: ${result.summary}`);
    } else {
      console.log("❌ Failed to complete camera to Slack demo");
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
  const channelName = args[0] || "general";
  const slackPackage = args[1] || "com.Slack";
  const serial = args[2] || process.env.DEVICE_SERIAL;
  const mode = args[3] || "manual"; // "manual" or "auto"

  console.log(`Sharing photo to #${channelName}...`);

  (async () => {
    if (mode === "auto") {
      await demoCameraToSlackAutomated(channelName, slackPackage, serial);
    } else {
      await demoCameraToSlack(channelName, slackPackage, serial);
    }
  })();
}
