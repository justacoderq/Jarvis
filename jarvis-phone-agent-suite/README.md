# JARVIS Phone Agent Suite

This folder is the merged workspace for all four repos in your hackathon solution. Every original codebase is preserved inside `apps/`, and the root files define how they fit together as one product:

- `apps/jarvis-mobile`: the JARVIS-style mobile shell with the Iron Man-like HUD, wake word, camera view, waveform UI, and assistant identity
- `apps/phonepilot-web`: the PhonePilot autonomous phone controller with ADB tools, screen understanding, planning, execution, and verification
- `apps/siri2-server`: the rooted Android / Termux agent server with notification triage, lock management, filtering, scheduling, and HTTP endpoints
- `apps/jigglewiggle-web`: the optional movement coaching side module with pose tracking, gesture control, AI coaching, reports, Zoom mode, and video generation

## Product framing

The merged story is:

**JARVIS Phone Agent: a voice-first AI assistant with an AR-style HUD that can understand your phone, operate apps on your behalf, react to notifications, run scheduled tasks, and optionally provide camera-based movement coaching.**

The JARVIS look is AR-styled rather than true headset AR. It uses a live camera feed with a futuristic HUD overlay, which is the right demo language for the Iron Man aesthetic.

## Workspace layout

```text
jarvis-phone-agent-suite/
  apps/
    jarvis-mobile/
    phonepilot-web/
    siri2-server/
    jigglewiggle-web/
  package.json
  suite.config.json
```

## Feature inventory

The suite now contains all features present in the source repos:

- JARVIS mobile HUD UI
- wake-word voice activation
- live camera context
- waveform and vitals panels
- task display and assistant shell
- Android phone control via ADB
- screenshot/XML-based screen understanding
- plan -> act -> observe -> verify loop
- multi-step phone task execution
- rooted Android agent mode
- local HTTP API for commands
- device lock and emergency release
- notification watcher and AI triage
- notification whitelist management
- cron-like scheduler and run logs
- motion coaching side mode
- YouTube ingest and scoring
- pose comparison and gesture controls
- AI coach feedback
- report card generation
- Zoom integration
- AI video generation flow

## Run commands

Run each module from the root:

```bash
npm run dev:phonepilot
npm run dev:phonepilot:mastra
npm run dev:siri2
npm run dev:siri2:server
npm run dev:jigglewiggle
```

For the Flutter app:

```bash
cd apps/jarvis-mobile
flutter pub get
flutter run
```

## Keys to provide locally

This suite is being normalized to `OpenAI + Gemini only`.

- `apps/jarvis-mobile/.env`: `GEMINI_API_KEY`, optional `PICOVOICE_ACCESS_KEY`
- `apps/phonepilot-web/.env.local`: `OPENAI_API_KEY`, `GOOGLE_API_KEY`
- `apps/siri2-server/.env`: `OPENAI_API_KEY`
- `apps/jigglewiggle-web/.env.local`: `OPENAI_API_KEY`

## Integration direction

The right integration path from here is:

1. Keep `jarvis-mobile` as the main user-facing app.
2. Point it at `siri2-server` for command, notification, and scheduling APIs.
3. Port `phonepilot-web` ADB/screen-control logic behind the same command layer.
4. Keep `jigglewiggle-web` as a bonus mode or future multimodal extension instead of the main pitch.

## Source provenance

This folder was assembled from:

- `jarvis-main/jarvis-main`
- `phoneagent-main/phoneagent-main`
- `Siri2-main/Siri2-main`
- `jigglewiggle-main/jigglewiggle-main`
