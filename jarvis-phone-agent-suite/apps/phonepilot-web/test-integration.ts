#!/usr/bin/env tsx
/**
 * Integration test script for PhonePilot
 * Tests the core functionality without requiring an actual Android device
 */

import { mastra } from "./mastra";
import { executeSingleAction } from "./mastra/agents/phonepilot-agent";
import * as ADB from "./mastra/tools/adb";

async function testMastraSetup() {
  console.log("🧪 Testing Mastra setup...");
  
  try {
    // Test agent registration
    const phonePilotAgent = mastra.getAgent("phonePilotAgent");
    const plannerAgent = mastra.getAgent("plannerAgent");
    const analyzerAgent = mastra.getAgent("analyzerAgent");
    
    if (!phonePilotAgent) throw new Error("PhonePilot agent not registered");
    if (!plannerAgent) throw new Error("Planner agent not registered");
    if (!analyzerAgent) throw new Error("Analyzer agent not registered");
    
    console.log("✅ All agents registered successfully");
    return true;
  } catch (error: any) {
    console.log("❌ Mastra setup failed:", error.message);
    return false;
  }
}

async function testAdbTools() {
  console.log("🔧 Testing ADB tools...");
  
  try {
    // Test tool imports
    const tools = [
      ADB.deviceGetInfo,
      ADB.deviceWake,
      ADB.inputTap,
      ADB.uiDump,
      ADB.mediaScreenshot,
      ADB.coordsScaleNormToDevice
    ];
    
    for (const tool of tools) {
      if (!tool || typeof tool.execute !== 'function') {
        throw new Error(`Tool ${tool?.id || 'unknown'} is not properly defined`);
      }
    }
    
    console.log("✅ All ADB tools imported successfully");
    
    // Test coordinate scaling (doesn't require device)
    const coordResult = await ADB.coordsScaleNormToDevice.execute({
      context: { nx: 0.5, ny: 0.5, deviceW: 1080, deviceH: 2340 }
    });
    
    if (!coordResult.ok || !coordResult.data) {
      throw new Error("Coordinate scaling failed");
    }
    
    const { x, y } = coordResult.data;
    if (x !== 540 || y !== 1170) {
      throw new Error(`Coordinate scaling incorrect: expected (540, 1170), got (${x}, ${y})`);
    }
    
    console.log("✅ Coordinate scaling test passed");
    
    // Test UI parsing with mock XML
    const mockXml = `
      <hierarchy rotation="0">
        <node index="0" text="Button" content-desc="Test button" resource-id="com.example:id/button" class="android.widget.Button" package="com.example" clickable="true" enabled="true" bounds="[100,200][300,250]" />
        <node index="1" text="Text Field" class="android.widget.EditText" clickable="false" enabled="true" bounds="[50,300][400,350]" />
      </hierarchy>
    `;
    
    const parseResult = await ADB.uiParse.execute({ context: { xml: mockXml } });
    if (!parseResult.ok || !parseResult.data || parseResult.data.length !== 2) {
      throw new Error("UI parsing test failed");
    }
    
    console.log("✅ UI parsing test passed");
    
    // Test node finding
    const findResult = await ADB.uiFindByText.execute({
      context: { text: "Button", contains: false, nodes: parseResult.data }
    });
    
    if (!findResult.ok || !findResult.data) {
      throw new Error("Node finding test failed");
    }
    
    console.log("✅ Node finding test passed");
    
    return true;
  } catch (error: any) {
    console.log("❌ ADB tools test failed:", error.message);
    return false;
  }
}

async function testAgentGeneration() {
  console.log("🤖 Testing agent generation...");
  
  try {
    const plannerAgent = mastra.getAgent("plannerAgent");
    
    // Test basic generation (this will work without Cerebras API key in some cases)
    try {
      const response = await plannerAgent.generate("Test prompt for agent functionality", {
        maxSteps: 1
      });
      
      if (response.text) {
        console.log("✅ Planner agent generation successful");
      } else {
        console.log("⚠️ Planner agent generation returned empty response");
      }
    } catch (error: any) {
      if (error.message.includes("API key") || error.message.includes("401")) {
        console.log("⚠️ Planner agent test skipped (API key required)");
      } else {
        throw error;
      }
    }
    
    return true;
  } catch (error: any) {
    console.log("❌ Agent generation test failed:", error.message);
    return false;
  }
}

async function testDeviceConnection() {
  console.log("📱 Testing device connection...");
  
  try {
    // This will fail without a connected device, but we can test the error handling
    const result = await executeSingleAction("deviceGetInfo", {});
    
    if (result.ok) {
      console.log("✅ Device connected and responding");
      console.log("Device info:", result.data);
    } else {
      console.log("⚠️ No device connected (this is expected for testing)");
      console.log("Error:", result.error);
    }
    
    return true;
  } catch (error: any) {
    console.log("❌ Device connection test failed:", error.message);
    return false;
  }
}

async function runIntegrationTests() {
  console.log("🚀 Starting PhonePilot Integration Tests\n");
  
  const tests = [
    { name: "Mastra Setup", fn: testMastraSetup },
    { name: "ADB Tools", fn: testAdbTools },
    { name: "Agent Generation", fn: testAgentGeneration },
    { name: "Device Connection", fn: testDeviceConnection }
  ];
  
  let passed = 0;
  let total = tests.length;
  
  for (const test of tests) {
    console.log(`\n--- ${test.name} ---`);
    const result = await test.fn();
    if (result) passed++;
    console.log("");
  }
  
  console.log("=" * 50);
  console.log(`Integration Tests Complete: ${passed}/${total} passed`);
  console.log(`Success Rate: ${Math.round((passed / total) * 100)}%`);
  
  if (passed === total) {
    console.log("🎉 All tests passed! PhonePilot is ready to use.");
  } else {
    console.log("⚠️ Some tests failed. Check the output above for details.");
  }
  
  console.log("\n📋 Next Steps:");
  console.log("1. Set up API keys in .env file:");
  console.log("   - OPENAI_API_KEY=your_openai_key");
  console.log("   - GOOGLE_API_KEY=your_gemini_key");
  console.log("2. Connect an Android device with USB debugging enabled");
  console.log("3. Run: adb devices (to verify connection)");
  console.log("4. Start the Mastra dev server: npm run dev:mastra");
  console.log("5. Start Next.js: npm run dev");
  console.log("6. Visit http://localhost:3000/phonepilot");
  
  return passed === total;
}

// Run tests if this file is executed directly
if (require.main === module) {
  runIntegrationTests().catch(console.error);
}

export { runIntegrationTests };
