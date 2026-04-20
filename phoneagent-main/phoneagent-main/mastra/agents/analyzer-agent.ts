import { Agent } from "@mastra/core/agent";
import { google } from "@ai-sdk/google";
import { z } from "zod";

const selectorSchema = z.object({
  by: z.enum(["text", "desc", "res"]).describe("Selector type"),
  value: z.string().describe("Selector value to search for"),
  contains: z.boolean().optional().default(false).describe("Whether to use contains matching")
});

const analysisResponseSchema = z.object({
  selector: selectorSchema.optional().describe("Best selector for the target element"),
  fallbackCoordsNorm: z.object({
    x: z.number().min(0).max(1).describe("Normalized X coordinate (0-1)"),
    y: z.number().min(0).max(1).describe("Normalized Y coordinate (0-1)")
  }).optional().describe("Fallback normalized coordinates if selector not found"),
  confidence: z.number().min(0).max(1).describe("Confidence in the analysis (0-1)"),
  notes: z.string().describe("Brief explanation of what was identified"),
  elements: z.array(z.object({
    type: z.string().describe("Element type (button, text, image, etc.)"),
    text: z.string().optional().describe("Visible text"),
    description: z.string().optional().describe("Content description"),
    location: z.string().describe("Location description (top-left, center, etc.)"),
    confidence: z.number().min(0).max(1).describe("Confidence for this element")
  })).optional().describe("All notable elements visible on screen")
});

export const analyzerAgent = new Agent({
  name: "Analyzer Agent",
  instructions: `
You are a multimodal Android UI analyzer that examines screenshots and UI hierarchies to identify elements and provide precise targeting information.

Your job is to:
1. Analyze screenshots to identify UI elements, their locations, and content
2. Correlate visual information with UI hierarchy data when available
3. Provide the best selector (text/content-desc/resource-id) for target elements
4. Give fallback normalized coordinates when selectors aren't reliable
5. Assess the current state of the UI for verification purposes

Key principles:
- Always prefer selectors over coordinates when possible
- Provide high confidence ratings for clear, unambiguous elements
- Use descriptive notes to explain what you identified
- Consider accessibility features (content descriptions)
- Account for different screen sizes and orientations

When analyzing:
- Look for buttons, text fields, images, lists, and interactive elements
- Identify navigation elements (back button, menu, tabs)
- Note the current app state and focused component
- Consider the user's intent from the planned action
- Provide normalized coordinates (0-1) relative to screen dimensions

For targeting specific elements:
- If you see clear text on a button/element, use text selector
- If element has a content description, use desc selector  
- If element has a resource ID in the UI hierarchy, use res selector
- Only use coordinates as fallback when selectors aren't available

Response format:
Return structured analysis with selector, fallbackCoordsNorm, confidence, notes, and optionally a list of all notable elements.
`,
  model: google("gemini-1.5-flash"),
});

export async function analyzeScreen(
  screenshotBase64?: string,
  uiHierarchy?: any,
  planStep?: any,
  deviceInfo?: any
) {
  const messages = [];
  
  // Add screenshot if available
  if (screenshotBase64) {
    messages.push({
      role: "user" as const,
      content: [
        {
          type: "image" as const,
          image: `data:image/png;base64,${screenshotBase64}`,
          mimeType: "image/png" as const
        },
        {
          type: "text" as const,
          text: "Analyze this Android screenshot for UI elements and their locations."
        }
      ]
    });
  }

  // Add context prompt
  const contextPrompt = `
${planStep ? `PLANNED ACTION: ${JSON.stringify(planStep, null, 2)}` : ''}

${uiHierarchy ? `UI HIERARCHY: ${JSON.stringify(uiHierarchy, null, 2)}` : ''}

${deviceInfo ? `DEVICE INFO: ${JSON.stringify(deviceInfo, null, 2)}` : ''}

Analyze the current screen and identify the best way to target elements for the planned action. 
Provide selectors when possible, normalized coordinates as fallback, and assess your confidence level.
`;

  messages.push({
    role: "user" as const,
    content: contextPrompt
  });

  const response = await analyzerAgent.generate(messages, {
    experimental_output: analysisResponseSchema
  });

  return response.object;
}

export async function generateHingeRoast(screenshotBase64: string) {
  const roastPrompt = {
    role: "user" as const,
    content: [
      {
        type: "image" as const,
        image: `data:image/png;base64,${screenshotBase64}`,
        mimeType: "image/png" as const
      },
      {
        type: "text" as const,
        text: `
Generate a witty, clever roast comment for this Hinge profile. 
Keep it playful and humorous, not mean-spirited. 
Focus on something interesting you notice in their photos or profile.
Return just the roast text, nothing else.
`
      }
    ]
  };

  const response = await analyzerAgent.generate([roastPrompt]);
  return response.text;
}