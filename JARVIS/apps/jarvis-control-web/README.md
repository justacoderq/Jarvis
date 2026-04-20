# TaskRunner

**AI-powered Android automation**

An autonomous Android device controller using multimodal AI agents. TaskRunner reads phone UI, plans actions, and executes them via ADB using a Plan -> Act -> Observe -> Verify loop.

**Built with:** TypeScript, Mastra.ai, OpenAI, Gemini, and ADB

## Demo

[Watch TaskRunner in Action](https://www.youtube.com/watch?v=otLwivWkeIg)

## Architecture

```text
User Goal -> Planner (OpenAI) -> Vision Analysis (Gemini) -> ADB Executor -> Device Action -> UI Verification
```

## Components

- Planner: OpenAI for step planning and reflection
- Vision: Gemini for screenshot and UI XML analysis
- Executor: TypeScript ADB wrapper with closed-loop verification
- Frontend: Next.js interface with real-time device monitoring

## Prerequisites

- Node.js 20+
- Android Debug Bridge (ADB)
- Android device with USB debugging enabled
- API keys for OpenAI and Google Gemini

## Installation

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local`:

```env
OPENAI_API_KEY=your_openai_api_key
GOOGLE_API_KEY=your_gemini_api_key
```

3. Connect your Android device:

```bash
adb devices
```

4. Start the application:

```bash
npm run dev:mastra
npm run dev
```

5. Open [http://localhost:3000/control](http://localhost:3000/control)

## Example goals

- `Open Camera, flip to front camera, take a photo, and share it to Slack`
- `Take a screenshot and save it to the gallery`
- `Open Settings and navigate to WiFi`

## Testing

```bash
npm run test:integration
```
