// Export all demo functions for easy importing
export { demoUnlockWithPin, demoUnlockManualSteps } from "./unlock";
export { demoHingeRoast, demoHingeRoastAutomated } from "./hingeRoast";
export { demoCameraToSlack, demoCameraToSlackAutomated } from "./cameraToSlack";

// Demo runner that can execute all demos in sequence
export async function runAllDemos(config: {
  pin?: string;
  channelName?: string;
  slackPackage?: string;
  deviceSerial?: string;
  profileCount?: number;
}) {
  const {
    pin = process.env.PHONE_PIN,
    channelName = "general",
    slackPackage = "com.Slack",
    deviceSerial,
    profileCount = 3
  } = config;

  console.log("🚀 Running all PhonePilot demos...\n");

  const results = {
    unlock: null as any,
    hingeRoast: null as any,
    cameraToSlack: null as any
  };

  try {
    // Demo 1: Unlock with PIN
    if (pin) {
      console.log("=== DEMO 1: UNLOCK WITH PIN ===");
      const { demoUnlockWithPin } = await import("./unlock");
      results.unlock = await demoUnlockWithPin(pin, deviceSerial);
      console.log(`Result: ${results.unlock.success ? 'SUCCESS' : 'FAILED'}\n`);
      
      if (!results.unlock.success) {
        console.log("❌ Unlock failed, skipping remaining demos");
        return results;
      }

      // Wait between demos
      await new Promise(resolve => setTimeout(resolve, 2000));
    } else {
      console.log("⚠️ Skipping unlock demo (no PIN provided)\n");
    }

    // Demo 2: Hinge Roast
    console.log("=== DEMO 2: HINGE ROAST ===");
    const { demoHingeRoast } = await import("./hingeRoast");
    results.hingeRoast = await demoHingeRoast(profileCount, deviceSerial);
    console.log(`Result: ${results.hingeRoast.success ? 'SUCCESS' : 'FAILED'}\n`);

    // Wait between demos
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Demo 3: Camera to Slack
    console.log("=== DEMO 3: CAMERA TO SLACK ===");
    const { demoCameraToSlack } = await import("./cameraToSlack");
    results.cameraToSlack = await demoCameraToSlack(channelName, slackPackage, deviceSerial);
    console.log(`Result: ${results.cameraToSlack.success ? 'SUCCESS' : 'FAILED'}\n`);

    // Summary
    console.log("=== DEMO SUMMARY ===");
    const successCount = Object.values(results).filter(r => r?.success).length;
    const totalCount = Object.values(results).filter(r => r !== null).length;
    
    console.log(`Completed: ${successCount}/${totalCount} demos`);
    console.log(`Success rate: ${Math.round((successCount / totalCount) * 100)}%`);

    return results;

  } catch (error: any) {
    console.error("Demo suite failed:", error.message);
    return { ...results, error: error.message };
  }
}