import { planNextStep, plannerAgent } from "../agents/planner-agent";
import { analyzeScreen } from "../agents/analyzer-agent";
import * as ADB from "../tools/adb";
import { ToolResult, UiNode, DeviceInfo } from "../tools/adb/types";

export interface RunContext {
  goal: string;
  currentStep: number;
  maxSteps: number;
  deviceSerial?: string;
  deviceInfo?: DeviceInfo;
  lastScreenshot?: {
    path: string;
    base64?: string;
    width: number;
    height: number;
  };
  uiNodes?: UiNode[];
  recentActions: ActionResult[];
  evidence: {
    screenshots: string[];
    textsFound: string[];
    focus?: string;
  };
}

export interface ActionResult {
  step: number;
  action: string;
  params: any;
  success: boolean;
  result?: any;
  error?: string;
  timestamp: number;
  verification?: {
    expected?: any;
    actual?: any;
    success: boolean;
    error?: string;
  };
}

export interface ExecutionResult {
  success: boolean;
  status: "completed" | "failed" | "max_steps_reached";
  finalContext: RunContext;
  steps: ActionResult[];
  summary?: string;
  error?: string;
}

export class PhonePilotExecutor {
  private adbWrapper: ADB.AdbWrapper;

  constructor(deviceSerial?: string) {
    this.adbWrapper = new ADB.AdbWrapper(deviceSerial);
  }

  async executeGoal(
    goal: string,
    maxSteps: number = 20,
    deviceSerial?: string
  ): Promise<ExecutionResult> {
    const context: RunContext = {
      goal,
      currentStep: 0,
      maxSteps,
      deviceSerial,
      recentActions: [],
      evidence: {
        screenshots: [],
        textsFound: []
      }
    };

    const steps: ActionResult[] = [];

    try {
      // Initialize device connection and get info
      await this.initializeDevice(context);

      // Main PAOV loop
      let attemptCount = 0;
      const maxAttempts = maxSteps * 3; // Allow retries
      
      while (context.currentStep < maxSteps && attemptCount < maxAttempts) {
        attemptCount++;
        console.log(`\n=== STEP ${context.currentStep + 1}/${maxSteps} (Attempt ${attemptCount}) ===`);
        
        // PERCEIVE: Get current UI state
        const perceptionResult = await this.perceiveCurrentState(context);
        if (!perceptionResult.success) {
          return {
            success: false,
            status: "failed",
            finalContext: context,
            steps,
            error: perceptionResult.error
          };
        }

        // LET AI PLANNER DECIDE COMPLETION - no hardcoded goal logic

        // PLAN: Determine next action
        const planResult = await this.planNextAction(context);
        if (!planResult) {
          return {
            success: false,
            status: "failed", 
            finalContext: context,
            steps,
            error: "Failed to generate plan"
          };
        }

        // Check if goal is complete
        if (planResult.status === "done") {
          return {
            success: true,
            status: "completed",
            finalContext: context,
            steps,
            summary: planResult.summary
          };
        }

        // Check if blocked
        if (planResult.status === "blocked") {
          return {
            success: false,
            status: "failed",
            finalContext: context,
            steps,
            error: `Blocked: ${planResult.error}. Suggested fix: ${planResult.suggestedFix}`
          };
        }

        // ACT: Execute the planned action
        const actionResult = await this.executeAction(context, planResult.nextStep!);
        steps.push(actionResult);
        context.recentActions.push(actionResult);

        // OBSERVE: Take screenshot and dump UI after action
        await this.observeAfterAction(context);

        // VERIFY: Check if expected outcomes occurred
        const verifyResult = await this.verifyAction(context, planResult.nextStep!, actionResult);
        actionResult.verification = verifyResult;

        // Log verification results
        if (!verifyResult.success) {
          console.log(`Verification failed: ${verifyResult.error}`);
          // Don't increment step - will retry
        } else {
          console.log(`Verification passed`);
          
          // Only increment step on successful actions
          if (actionResult.success) {
            console.log(`✅ Action successful - advancing to next step`);
            context.currentStep++;
            
            // Check if AI thinks goal is complete after this successful action
            console.log(`🤔 Checking if goal might be complete after successful action...`);
            const completionCheckResult = await this.checkGoalCompletion(context, planResult.nextStep!);
            
            if (completionCheckResult.isComplete) {
              console.log(`🎯 GOAL COMPLETE! AI determined goal is finished.`);
              return {
                success: true,
                status: "completed",
                finalContext: context,
                steps,
                summary: completionCheckResult.summary || "Goal completed successfully"
              };
            }
          } else {
            console.log(`❌ Action failed - staying on current step to retry`);
          }
        }
      }

      // Check why we exited the loop
      if (attemptCount >= maxAttempts) {
        return {
          success: false,
          status: "max_attempts_reached",
          finalContext: context,
          steps,
          error: `Reached maximum attempts (${maxAttempts}) without completing goal`
        };
      } else {
        return {
          success: false,
          status: "max_steps_reached",
          finalContext: context,
          steps,
          error: `Reached maximum steps (${maxSteps}) without completing goal`
        };
      }

    } catch (error: any) {
      return {
        success: false,
        status: "failed",
        finalContext: context,
        steps,
        error: error?.message || "Unknown execution error"
      };
    }
  }

  private async initializeDevice(context: RunContext): Promise<{ success: boolean; error?: string }> {
    try {
      // Get device serial if not provided
      if (!context.deviceSerial) {
        const serialResult = await this.adbWrapper.getFirstDeviceSerial();
        if (!serialResult.ok) {
          return { success: false, error: serialResult.error };
        }
        context.deviceSerial = serialResult.data;
        this.adbWrapper.setSerial(serialResult.data!);
      }

      // Get device info
      const deviceInfoResult = await ADB.deviceGetInfo.execute({ 
        context: { serial: context.deviceSerial } 
      });
      if (deviceInfoResult.ok && deviceInfoResult.data) {
        context.deviceInfo = deviceInfoResult.data;
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error?.message || "Failed to initialize device" };
    }
  }

  private shouldTakeScreenshot(context: RunContext): boolean {
    // Take screenshot only for:
    // 1. First step (baseline)
    // 2. After major UI changes (app launches)
    // 3. When explicitly debugging issues
    // 4. After successful app launches (to see what opened)
    
    if (context.currentStep === 0) return true; // Always take initial screenshot
    
    const lastAction = context.recentActions[context.recentActions.length - 1];
    if (!lastAction) return false;
    
    // Always take screenshot after successful app launches
    if (lastAction.success && (
      lastAction.action === 'launch' ||
      lastAction.action === 'launchCamera' ||
      lastAction.action === 'launchByAppName' ||
      lastAction.action === 'monkeyLaunch'
    )) {
      return true;
    }
    
    // Take screenshot after major UI changes
    const expectedChange = this.getExpectedUIChangeType(lastAction.action, lastAction.params);
    if (expectedChange === 'major') return true;
    
    // Take screenshot if last few actions failed (debugging)
    const recentFailures = context.recentActions.slice(-3).filter(a => !a.success).length;
    if (recentFailures >= 2) return true;
    
    return false;
  }

  private async perceiveCurrentState(context: RunContext): Promise<{ success: boolean; error?: string }> {
    try {
      // Strategic screenshot taking
      if (this.shouldTakeScreenshot(context)) {
        console.log("Taking strategic screenshot");
        const screenshotResult = await ADB.mediaScreenshot.execute({
          context: { 
            path: `/sdcard/taskrunner_step_${context.currentStep}.png`,
            serial: context.deviceSerial 
          }
        });

        if (screenshotResult.ok && screenshotResult.data) {
          context.lastScreenshot = screenshotResult.data;
          context.evidence.screenshots.push(screenshotResult.data.path);
        }
      } else {
        console.log("Skipping screenshot - not needed for this step");
      }

      // Smart UI dumping - only when we need to find elements
      if (this.needsUIForNextAction(context)) {
        console.log("Taking UI dump - needed to find elements");
        const uiDumpResult = await ADB.uiDump.execute({
          context: { serial: context.deviceSerial }
        });

        if (uiDumpResult.ok && uiDumpResult.data) {
          // Parse UI nodes
          const parseResult = await ADB.uiParse.execute({
            context: { xml: uiDumpResult.data.xml }
          });

          if (parseResult.ok && parseResult.data) {
            context.uiNodes = parseResult.data;
            const visibleTexts = parseResult.data
              .flatMap((node: any) => [node.text, node.desc])
              .filter((value: string | undefined) => !!value)
              .map((value: string) => value.trim())
              .filter((value: string) => value.length > 0);
            context.evidence.textsFound = Array.from(new Set(visibleTexts)).slice(0, 100);
            console.log(`Parsed ${parseResult.data.length} UI nodes`);
          }
        }
      } else {
        console.log("Skipping UI dump - not needed for next action");
        // Clear old UI nodes if we're not updating them
        context.uiNodes = [];
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error?.message || "Failed to perceive current state" };
    }
  }

  private isSimpleGoal(goal: string): boolean {
    const goalLower = goal.toLowerCase();
    // Only truly simple goals that never need UI interaction
    return goalLower === 'screenshot' || 
           goalLower === 'wake' ||
           goalLower === 'wake device' ||
           (goalLower.includes('open') && goalLower.includes('camera') && 
            !goalLower.includes('flip') && !goalLower.includes('switch') && 
            !goalLower.includes('take') && !goalLower.includes('photo'));
  }

  private needsUIForNextAction(context: RunContext): boolean {
    const goalLower = context.goal.toLowerCase();
    const lastAction = context.recentActions[context.recentActions.length - 1];
    
    // Always need UI after successful app launches to see what's on screen
    if (lastAction && lastAction.success && (
      lastAction.action === 'launch' ||
      lastAction.action === 'launchCamera' ||
      lastAction.action === 'launchByAppName' ||
      lastAction.action === 'monkeyLaunch'
    )) {
      return true;
    }
    
    // Always need UI if goal involves finding/interacting with elements
    if (goalLower.includes('flip') || goalLower.includes('switch') || 
        goalLower.includes('take') || goalLower.includes('photo') ||
        goalLower.includes('share') || goalLower.includes('send') ||
        goalLower.includes('like') || goalLower.includes('tap') ||
        goalLower.includes('click') || goalLower.includes('press')) {
      return true;
    }
    
    // Need UI if last action failed (to understand why)
    if (lastAction && !lastAction.success) {
      return true;
    }
    
    return false;
  }

  private async planNextAction(context: RunContext) {
    try {
      const currentState = {
        uiNodes: context.uiNodes,
        screenshot: context.lastScreenshot,
        step: context.currentStep
      };

      const lastAction = context.recentActions.length > 0 
        ? context.recentActions[context.recentActions.length - 1]
        : undefined;

      return await planNextStep(
        context.goal,
        currentState,
        lastAction,
        context.deviceInfo,
        context.evidence,
        context.recentActions
      );
    } catch (error: any) {
      console.error("Planning error:", error);
      return null;
    }
  }

  private async executeAction(context: RunContext, planStep: any): Promise<ActionResult> {
    const actionResult: ActionResult = {
      step: context.currentStep,
      action: planStep.action,
      params: planStep.params,
      success: false,
      timestamp: Date.now()
    };

    try {
      let result: ToolResult<any>;

      // Execute action based on type
      switch (planStep.action) {
        case "tap":
          result = await ADB.inputTap.execute({
            context: { ...planStep.params, serial: context.deviceSerial }
          });
          break;

        case "tapByText":
          // Find element by text and tap it
          if (context.uiNodes) {
            const findResult = await ADB.uiFindByText.execute({
              context: { 
                text: planStep.params.text,
                contains: planStep.params.contains || false,
                nodes: context.uiNodes
              }
            });
            
            if (findResult.ok && findResult.data) {
              result = await ADB.uiTapNode.execute({
                context: { node: findResult.data, serial: context.deviceSerial }
              });
            } else {
              result = { ok: false, error: "Element not found by text" };
            }
          } else {
            result = { ok: false, error: "No UI nodes available" };
          }
          break;

        case "tapByDesc":
          // Find element by description and tap it
          if (context.uiNodes) {
            const findResult = await ADB.uiFindByDesc.execute({
              context: { 
                desc: planStep.params.desc,
                contains: planStep.params.contains || false,
                nodes: context.uiNodes
              }
            });
            
            if (findResult.ok && findResult.data) {
              result = await ADB.uiTapNode.execute({
                context: { node: findResult.data, serial: context.deviceSerial }
              });
            } else {
              result = { ok: false, error: "Element not found by description" };
            }
          } else {
            result = { ok: false, error: "No UI nodes available" };
          }
          break;

        case "tapByRes":
          // Find element by resource ID and tap it
          if (context.uiNodes) {
            const findResult = await ADB.uiFindByRes.execute({
              context: { 
                res: planStep.params.res,
                contains: planStep.params.contains || false,
                nodes: context.uiNodes
              }
            });
            
            if (findResult.ok && findResult.data) {
              result = await ADB.uiTapNode.execute({
                context: { node: findResult.data, serial: context.deviceSerial }
              });
            } else {
              result = { ok: false, error: "Element not found by resource ID" };
            }
          } else {
            result = { ok: false, error: "No UI nodes available" };
          }
          break;

        case "typeText":
          result = await ADB.inputTypeText.execute({
            context: { ...planStep.params, serial: context.deviceSerial }
          });
          break;

        case "launch":
          result = await ADB.appLaunch.execute({
            context: { ...planStep.params, serial: context.deviceSerial }
          });
          break;

        case "launchCamera":
          // Use the reliable camera intent launch
          result = await ADB.appLaunch.execute({
            context: { 
              action: "android.media.action.STILL_IMAGE_CAMERA",
              serial: context.deviceSerial 
            }
          });
          break;

        case "monkeyLaunch":
          result = await ADB.appMonkeyLaunch.execute({
            context: { ...planStep.params, serial: context.deviceSerial }
          });
          break;

        case "monkeyLaunchVerified":
          // Monkey launch with verification - more reliable for problematic apps
          const monkeyResult = await ADB.appMonkeyLaunch.execute({
            context: { ...planStep.params, serial: context.deviceSerial }
          });
          
          if (monkeyResult.ok) {
            console.log("Waiting for monkey-launched app to start...");
            await new Promise(resolve => setTimeout(resolve, 4000));
            
            // Verify it opened if package is provided
            if (planStep.params.package) {
              const verifyResult = await ADB.appGetCurrent.execute({
                context: { serial: context.deviceSerial }
              });
              
              if (verifyResult.ok && verifyResult.data) {
                const currentPackage = verifyResult.data.package;
                if (currentPackage === planStep.params.package) {
                  console.log(`✅ Monkey launch verified: ${currentPackage} is running`);
                  result = {
                    ok: true,
                    data: `Successfully monkey-launched and verified ${planStep.params.package}`
                  };
                } else {
                  result = {
                    ok: false,
                    error: `Monkey launch failed verification. Expected: ${planStep.params.package}, Current: ${currentPackage}`
                  };
                }
              } else {
                result = monkeyResult; // Fall back to original result
              }
            } else {
              result = monkeyResult;
            }
          } else {
            result = monkeyResult;
          }
          break;

        case "swipe":
          result = await ADB.inputSwipe.execute({
            context: { ...planStep.params, serial: context.deviceSerial }
          });
          break;

        case "keyevent":
          result = await ADB.deviceKeyevent.execute({
            context: { ...planStep.params, serial: context.deviceSerial }
          });
          break;

        case "waitForText":
          result = await ADB.uiWaitForText.execute({
            context: { ...planStep.params, serial: context.deviceSerial }
          });
          break;

        case "screenshot":
          result = await ADB.mediaScreenshot.execute({
            context: { ...planStep.params, serial: context.deviceSerial }
          });
          break;

        case "shareImage":
          result = await ADB.shareSendImage.execute({
            context: { ...planStep.params, serial: context.deviceSerial }
          });
          
          // If the share intent opened a chooser instead of the target app directly,
          // try to find and tap the target app in the chooser
          if (result.ok && result.data && result.data.includes('Share chooser opened')) {
            console.log("Share chooser detected, attempting to select target app...");
            
            // Wait a moment for chooser to fully load
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Try to find the target app name in the chooser (e.g., "Slack")
            const targetAppName = planStep.params.package ? 
              planStep.params.package.split('.').pop() : // com.slack -> slack
              'Slack'; // fallback
              
            // Capitalize first letter for common app names
            const appDisplayName = targetAppName.charAt(0).toUpperCase() + targetAppName.slice(1);
            
            // Take UI dump to see the chooser
            const uiDumpResult = await ADB.uiDump.execute({
              context: { serial: context.deviceSerial }
            });
            
            if (uiDumpResult.ok && uiDumpResult.data) {
              const parseResult = await ADB.uiParse.execute({
                context: { xml: uiDumpResult.data.xml }
              });
              
              if (parseResult.ok && parseResult.data) {
                // Try to find the target app in the chooser
                const findResult = await ADB.uiFindByText.execute({
                  context: { text: appDisplayName, contains: true, nodes: parseResult.data }
                });
                
                if (findResult.ok && findResult.data) {
                  console.log(`Found ${appDisplayName} in share chooser, tapping...`);
                  const tapResult = await ADB.uiTapNode.execute({
                    context: { node: findResult.data, serial: context.deviceSerial }
                  });
                  
                  if (tapResult.ok) {
                    result = {
                      ok: true,
                      data: `${result.data} - Successfully selected ${appDisplayName} from share chooser`
                    };
                  }
                } else {
                  console.log(`Could not find ${appDisplayName} in share chooser`);
                }
              }
            }
          }
          break;

        case "getLatestImage":
          result = await ADB.mediaLatestImageUri.execute({
            context: { serial: context.deviceSerial }
          });
          break;

        case "listApps":
          result = await ADB.appListInstalled.execute({
            context: { ...planStep.params, serial: context.deviceSerial }
          });
          break;

        case "getCurrentApp":
          result = await ADB.appGetCurrent.execute({
            context: { serial: context.deviceSerial }
          });
          break;

        case "launchByAppName":
          // First list apps to find the package name, then launch
          const listResult = await ADB.appListInstalled.execute({
            context: { 
              thirdPartyOnly: true, 
              enabled: true, 
              serial: context.deviceSerial 
            }
          });
          
          if (listResult.ok && listResult.data) {
            const targetAppName = planStep.params.appName.toLowerCase();
            
            console.log(`Searching for app "${targetAppName}" among ${listResult.data.length} installed apps`);
            
            // Try multiple matching strategies
            let matchingApp = null;
            
            // 1. Exact package name match
            matchingApp = listResult.data.find(app => 
              app.package.toLowerCase().includes(targetAppName)
            );
            
            // 2. Common app patterns (Hinge -> com.hinge.*, Instagram -> com.instagram.*)
            if (!matchingApp) {
              const commonPatterns = [
                `com.${targetAppName}`,
                `com.${targetAppName}.android`,
                `com.${targetAppName}.app`,
                `${targetAppName}.app`,
                `org.${targetAppName}`,
              ];
              
              for (const pattern of commonPatterns) {
                matchingApp = listResult.data.find(app => 
                  app.package.toLowerCase().includes(pattern.toLowerCase())
                );
                if (matchingApp) break;
              }
            }
            
            // 3. Partial match anywhere in package name
            if (!matchingApp) {
              matchingApp = listResult.data.find(app => 
                app.package.toLowerCase().includes(targetAppName) ||
                (app.name && app.name.toLowerCase().includes(targetAppName))
              );
            }
            
            if (matchingApp) {
              console.log(`✅ Found matching app: ${matchingApp.package} for "${planStep.params.appName}"`);
              
              // Use monkey launch first (more reliable for many apps like Hinge)
              console.log(`Launching ${matchingApp.package} using monkey command...`);
              const launchResult = await ADB.appMonkeyLaunch.execute({
                context: { package: matchingApp.package, serial: context.deviceSerial }
              });
              
              if (launchResult.ok) {
                // Wait for app to start and verify it actually opened
                console.log("Waiting for app to fully launch...");
                await new Promise(resolve => setTimeout(resolve, 4000));
                
                // Check if the app is actually running
                const currentAppResult = await ADB.appGetCurrent.execute({
                  context: { serial: context.deviceSerial }
                });
                
                if (currentAppResult.ok && currentAppResult.data) {
                  const currentPackage = currentAppResult.data.package;
                  if (currentPackage === matchingApp.package) {
                    console.log(`✅ App verification successful: ${currentPackage} is now running`);
                    result = {
                      ok: true,
                      data: `Successfully launched and verified ${matchingApp.package}. Current app: ${currentPackage}`
                    };
                  } else {
                    console.log(`❌ App launch failed verification. Expected: ${matchingApp.package}, Current: ${currentPackage}`);
                    console.log("Trying alternative launch method (intent-based)...");
                    
                    // Try intent launch as fallback
                    const fallbackResult = await ADB.appLaunch.execute({
                      context: { package: matchingApp.package, serial: context.deviceSerial }
                    });
                    
                    if (fallbackResult.ok) {
                      await new Promise(resolve => setTimeout(resolve, 3000));
                      
                      // Check again
                      const verifyResult = await ADB.appGetCurrent.execute({
                        context: { serial: context.deviceSerial }
                      });
                      
                      if (verifyResult.ok && verifyResult.data?.package === matchingApp.package) {
                        console.log(`✅ Fallback launch successful: ${matchingApp.package} is now running`);
                        result = {
                          ok: true,
                          data: `Successfully launched ${matchingApp.package} using fallback method`
                        };
                      } else {
                        result = {
                          ok: false,
                          error: `Both launch methods failed. App ${matchingApp.package} not running. Current app: ${verifyResult.data?.package || 'unknown'}`
                        };
                      }
                    } else {
                      result = {
                        ok: false,
                        error: `App launch failed verification. Expected ${matchingApp.package} but current app is ${currentPackage}. Fallback also failed.`
                      };
                    }
                  }
                } else {
                  console.log("⚠️ Could not verify current app, but launch command succeeded");
                  result = launchResult; // Fall back to original result
                }
              } else {
                result = launchResult;
              }
            } else {
              // Show available apps for debugging
              console.log("Available apps:", listResult.data.slice(0, 10).map(app => app.package));
              
              // Try monkey launch with common package patterns
              const fallbackPatterns = [
                `com.${targetAppName}.android`,
                `com.${targetAppName}`,
                `com.${targetAppName}.app`
              ];
              
              for (const pattern of fallbackPatterns) {
                console.log(`Trying fallback pattern: ${pattern}`);
                const fallbackResult = await ADB.appMonkeyLaunch.execute({
                  context: { package: pattern, serial: context.deviceSerial }
                });
                
                if (fallbackResult.ok) {
                  result = fallbackResult;
                  break;
                }
              }
              
              if (!result || !result.ok) {
                result = { 
                  ok: false, 
                  error: `No app found matching "${planStep.params.appName}". Available apps: ${listResult.data.slice(0, 5).map(app => app.package.split('.').pop()).join(', ')}...` 
                };
              }
            }
          } else {
            result = { ok: false, error: "Failed to list installed apps" };
          }
          break;

        case "deviceWake":
          result = await ADB.deviceWake.execute({
            context: { serial: context.deviceSerial }
          });
          break;

        case "findByText":
          result = await ADB.uiFindByText.execute({
            context: { ...planStep.params, nodes: context.uiNodes }
          });
          break;

        case "findByDesc":
          result = await ADB.uiFindByDesc.execute({
            context: { ...planStep.params, nodes: context.uiNodes }
          });
          break;

        case "findByRes":
          result = await ADB.uiFindByRes.execute({
            context: { ...planStep.params, nodes: context.uiNodes }
          });
          break;

        case "confirmAction":
          // Try common confirmation patterns
          const confirmationTerms = ["Send", "Upload", "Share", "Confirm", "Yes", "OK", "Continue", "Submit", "Send like"];
          let confirmResult = null;
          
          for (const term of confirmationTerms) {
            if (context.uiNodes) {
              const findResult = await ADB.uiFindByText.execute({
                context: { text: term, contains: true, nodes: context.uiNodes }
              });
              
              if (findResult.ok && findResult.data) {
                confirmResult = await ADB.uiTapNode.execute({
                  context: { node: findResult.data, serial: context.deviceSerial }
                });
                if (confirmResult.ok) {
                  console.log(`Successfully confirmed action using "${term}"`);
                  break;
                }
              }
            }
          }
          
          // Also try by description
          if (!confirmResult || !confirmResult.ok) {
            for (const term of confirmationTerms) {
              if (context.uiNodes) {
                const findResult = await ADB.uiFindByDesc.execute({
                  context: { desc: term, contains: true, nodes: context.uiNodes }
                });
                
                if (findResult.ok && findResult.data) {
                  confirmResult = await ADB.uiTapNode.execute({
                    context: { node: findResult.data, serial: context.deviceSerial }
                  });
                  if (confirmResult.ok) {
                    console.log(`Successfully confirmed action using description "${term}"`);
                    break;
                  }
                }
              }
            }
          }
          
          result = confirmResult || { ok: false, error: "Could not find confirmation button" };
          break;

        case "dismissPopup":
          // Try common dismissal patterns
          const dismissalTerms = ["Skip", "Not now", "Cancel", "Close", "X", "Maybe later", "No thanks", "Dismiss"];
          let dismissResult = null;
          
          for (const term of dismissalTerms) {
            if (context.uiNodes) {
              const findResult = await ADB.uiFindByText.execute({
                context: { text: term, contains: true, nodes: context.uiNodes }
              });
              
              if (findResult.ok && findResult.data) {
                dismissResult = await ADB.uiTapNode.execute({
                  context: { node: findResult.data, serial: context.deviceSerial }
                });
                if (dismissResult.ok) {
                  console.log(`Successfully dismissed popup using "${term}"`);
                  break;
                }
              }
            }
          }
          
          if (!dismissResult || !dismissResult.ok) {
            // Try back button as fallback
            dismissResult = await ADB.deviceKeyevent.execute({
              context: { key: "KEYCODE_BACK", serial: context.deviceSerial }
            });
          }
          
          result = dismissResult || { ok: false, error: "Could not dismiss popup" };
          break;

        case "back":
          result = await ADB.deviceKeyevent.execute({
            context: { key: "KEYCODE_BACK", serial: context.deviceSerial }
          });
          break;

        default:
          result = { ok: false, error: `Unknown action: ${planStep.action}` };
      }

      actionResult.success = result.ok;
      actionResult.result = result.data;
      actionResult.error = result.error;

      console.log(`\n--- Action ${planStep.action} ---`);
      console.log(`Params:`, JSON.stringify(planStep.params, null, 2));
      console.log(`Result: ${result.ok ? 'SUCCESS' : 'FAILED'}`);
      if (result.data) {
        console.log(`Data:`, result.data);
      }
      if (!result.ok) {
        console.log(`Error: ${result.error}`);
      }
      console.log(`--- End Action ---\n`);

      return actionResult;
    } catch (error: any) {
      actionResult.error = error?.message || "Action execution failed";
      console.log(`Action ${planStep.action}: FAILED - ${actionResult.error}`);
      return actionResult;
    }
  }

  private async observeAfterAction(context: RunContext): Promise<void> {
    const lastAction = context.recentActions[context.recentActions.length - 1];
    
    // Wait longer for UI to settle based on action type
    let delayMs = 1000; // default delay
    
    if (lastAction) {
      switch (lastAction.action) {
        case 'launch':
        case 'launchCamera':
        case 'launchByAppName':
        case 'monkeyLaunch':
          delayMs = 5000; // App launches need more time - increased from 3s to 5s
          break;
        case 'tapByText':
        case 'tapByDesc':
        case 'tapByRes':
        case 'tap':
          delayMs = 1500; // UI interactions need some time
          break;
        case 'typeText':
          delayMs = 800; // Text input is usually quick
          break;
        case 'swipe':
        case 'keyevent':
          delayMs = 1200; // Gestures and key events need time
          break;
        default:
          delayMs = 1000;
      }
    }
    
    console.log(`Waiting ${delayMs}ms for UI to settle after ${lastAction?.action || 'action'}...`);
    await new Promise(resolve => setTimeout(resolve, delayMs));
    
    // Re-perceive state after action
    await this.perceiveCurrentState(context);
  }

  private async checkGoalCompletion(context: RunContext, lastAction: any): Promise<{ isComplete: boolean; summary?: string }> {
    const evidenceBasedCompletion = this.getEvidenceBasedCompletion(context);
    if (evidenceBasedCompletion.isComplete) {
      return evidenceBasedCompletion;
    }

    try {
      // Ask the AI planner to evaluate if the goal is complete based on recent actions
      const completionPrompt = `
GOAL: ${context.goal}

RECENT ACTIONS COMPLETED:
${context.recentActions.map((action, i) => 
  `${i + 1}. ${action.action} ${action.success ? '✅' : '❌'} - ${JSON.stringify(action.params)}`
).join('\n')}

LATEST ACTION: ${lastAction.action} ✅ - ${JSON.stringify(lastAction.params)}

CURRENT UI STATE: ${context.uiNodes ? `${context.uiNodes.length} UI elements detected` : 'No UI data'}

IMPORTANT: Consider the CORE GOAL achievement and required confirmations.
- Focus on whether the primary intent has been fulfilled AND any required confirmations completed
- Distinguish between REQUIRED confirmations vs. OPTIONAL upsells/promotions
- Required confirmations: "Send like?", "Confirm action?", "Yes/No?" - these should be completed
- Optional upsells: "Send rose?", "Upgrade to premium?", "Share to social?" - these can be skipped

Examples:
- Goal: "like a profile" → Continue if seeing "Send like?" confirmation, Complete if seeing "Send rose?" upsell
- Goal: "take a photo" → COMPLETE immediately after successful tapByDesc with "Take picture" - no confirmation needed
- Goal: "open camera, flip to front, take picture" → COMPLETE after successful picture taking action
- Goal: "send a message" → Continue if seeing "Send message?" confirmation, Complete if seeing delivery status

KEY: If the last UI shows a confirmation of the main action (like "Send like?"), continue to confirm.
If it shows an upsell/additional feature, the goal is complete.

Based on the goal and current UI state, should we continue with confirmation or is the CORE GOAL complete?

Respond with ONLY a JSON object:
{
  "isComplete": true/false,
  "summary": "brief explanation focusing on core goal achievement"
}
`;

      const response = await plannerAgent.generate(completionPrompt);
      
      // Try to parse JSON response
      const jsonPatterns = [
        /\{[^}]*"isComplete"[^}]*\}/,
        /\{[\s\S]*?\}/
      ];
      
      for (const pattern of jsonPatterns) {
        const match = response.text.match(pattern);
        if (match) {
          try {
            const parsed = JSON.parse(match[0]);
            if (parsed.hasOwnProperty('isComplete')) {
              if (parsed.isComplete && !this.getEvidenceBasedCompletion(context).isComplete) {
                return {
                  isComplete: false,
                  summary: "Planner suggested completion, but no visible UI evidence confirms it yet."
                };
              }
              return {
                isComplete: parsed.isComplete,
                summary: parsed.summary || 'AI completion check'
              };
            }
          } catch (e) {
            continue;
          }
        }
      }
      
      // If parsing failed, use heuristic
      return this.heuristicGoalCompletion(context);
      
    } catch (error) {
      console.log("Goal completion check error:", error);
      return this.heuristicGoalCompletion(context);
    }
  }

  private heuristicGoalCompletion(context: RunContext): { isComplete: boolean; summary?: string } {
    const evidenceBasedCompletion = this.getEvidenceBasedCompletion(context);
    if (evidenceBasedCompletion.isComplete) {
      return evidenceBasedCompletion;
    }

    const successfulActions = context.recentActions.filter(a => a.success);
    const goalLower = context.goal.toLowerCase();

    if (goalLower.includes("screenshot") &&
        successfulActions.some(action => action.action === "screenshot")) {
      return {
        isComplete: true,
        summary: "Screenshot captured successfully."
      };
    }

    if ((goalLower.includes("wake") || goalLower.includes("unlock")) &&
        successfulActions.some(action => action.action === "deviceWake")) {
      return {
        isComplete: true,
        summary: "Wake or unlock action executed successfully."
      };
    }
    
    return { isComplete: false };
  }

  private getEvidenceBasedCompletion(context: RunContext): { isComplete: boolean; summary?: string } {
    const goalLower = context.goal.toLowerCase();
    const visibleText = context.evidence.textsFound.join(" ").toLowerCase();

    if ((goalLower.includes("wi-fi") || goalLower.includes("wifi")) &&
        (visibleText.includes("wi-fi") || visibleText.includes("wifi"))) {
      return {
        isComplete: true,
        summary: "Wi-Fi is visible on screen, so the navigation goal appears complete."
      };
    }

    if (goalLower.includes("settings") &&
        (visibleText.includes("settings") || visibleText.includes("network & internet"))) {
      return {
        isComplete: true,
        summary: "Settings content is visible on screen."
      };
    }

    if ((goalLower.includes("camera") || goalLower.includes("photo") || goalLower.includes("picture")) &&
        (visibleText.includes("photo") || visibleText.includes("video") || visibleText.includes("portrait"))) {
      return {
        isComplete: true,
        summary: "Camera UI appears to be visible on screen."
      };
    }

    return { isComplete: false };
  }

  private getExpectedUIChangeType(action: string, params: any): 'none' | 'minimal' | 'major' {
    switch (action) {
      case 'launchCamera':
      case 'launch':
      case 'appLaunch':
        return 'major'; // New app opens, big UI change
      
      case 'screenshot':
      case 'deviceWake':
        return 'none'; // These don't change UI at all
      
      case 'keyevent':
        return 'minimal'; // Key events might cause changes
      
      case 'tapByText':
      case 'tapByDesc':
      case 'tapByRes':
      case 'tap':
        return 'minimal'; // Most UI interactions cause some change
      
      default:
        return 'minimal';
    }
  }

  private async verifyAction(
    context: RunContext, 
    planStep: any, 
    actionResult: ActionResult
  ): Promise<{ success: boolean; expected?: any; actual?: any; error?: string }> {
    try {
      // SIMPLIFIED VERIFICATION: Trust successful actions, learn from patterns
      
      // If action succeeded according to ADB, trust it
      if (actionResult.success) {
        // For app launches, add extra verification info
        if (planStep.action === 'launch' || planStep.action === 'launchByAppName' || planStep.action === 'monkeyLaunch') {
          console.log(`App launch ${planStep.action} succeeded - app should now be opening`);
          return { 
            success: true, 
            expected: 'App launched successfully',
            actual: `Launched app: ${actionResult.result || 'App launch intent sent'}`
          };
        }
        
        console.log(`Action ${planStep.action} succeeded - trusting result`);
        return { 
          success: true, 
          expected: 'Action executed successfully',
          actual: 'Trusted successful ADB result'
        };
      }
      
      // If action failed, only fail verification for critical actions
      const criticalActions = ['launchCamera', 'launch', 'launchByAppName', 'deviceWake'];
      if (criticalActions.includes(planStep.action)) {
        console.log(`Critical action ${planStep.action} failed: ${actionResult.error}`);
        return { success: false, error: actionResult.error };
      }
      
      // For non-critical actions that failed, warn but continue
      console.log(`Non-critical action ${planStep.action} failed, but continuing: ${actionResult.error}`);
      return { 
        success: true, 
        error: `Action failed but continuing: ${actionResult.error}` 
      };
      
    } catch (error: any) {
      console.log("Verification error:", error);
      return { 
        success: true, // Don't fail the whole process on verification errors
        error: error?.message || "Verification had issues but continuing" 
      };
    }
  }
}

