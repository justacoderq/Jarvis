# Jarvis Learning Coach

Jarvis Learning Coach is a multimodal AI assistant inspired by the idea of having your own Jarvis: a voice-first guide that can see your surroundings, create structured tasks, organize information, and launch a guided learning experience through **Learning Coach**.

It is useful because it helps users move from passive AI conversation to active guidance, planning, and learning support in one experience.

## Project Title

**Jarvis Learning Coach**

## What It Does

Jarvis is the main assistant layer:

- voice interaction
- visual understanding through the live camera
- task list creation and completion
- notes, reminders, lists, calendar items, and summary cards
- daily briefing and focus guidance

Learning Coach is Jarvis's guided coaching mode:

- guided practice sessions
- routine generation
- live coaching and feedback
- session support for active learning

Together, the product works like this:

1. You talk to Jarvis.
2. Jarvis understands the goal and organizes the session.
3. Jarvis launches **Learning Coach** for guided practice.
4. You return to Jarvis with a clearer plan and next step.

## Competition Fit

This project fits an AI competition because it moves beyond a basic chatbot. Jarvis combines:

- real-time voice interaction
- live camera context
- structured task and planning support
- guided learning handoff through Learning Coach

It is not just AI that answers. It is AI that helps users understand, organize, and act.

## Why This Project Is Useful

See [WHY_THIS_PROJECT_IS_USEFUL.md](./WHY_THIS_PROJECT_IS_USEFUL.md).

## How I Used Codex

See [HOW_I_USED_CODEX.md](./HOW_I_USED_CODEX.md).

## Demo Video

https://drive.google.com/file/d/1VQXHWCRuvmCgqsZoHoBA_vExKEFru0iv/view?usp=sharing

## How To Run

### 1. Start Learning Coach

From the repo root:

```powershell
cd "C:\Users\Prachi\Downloads\Open AI Hackathon"
npm.cmd run dev:suite:motion
```

### 2. Forward the Learning Coach port to the tablet

```powershell
adb devices
adb reverse tcp:3002 tcp:3002
adb reverse --list
```

### 3. Run the Flutter app

```powershell
cd "C:\Users\Prachi\Downloads\Open AI Hackathon\apps\jarvis-mobile"
& "C:\Users\Prachi\flutter\bin\flutter.bat" run
```

## Notes

- This project requires an Android device for the full mobile experience.
- The current product is intentionally scoped to **Jarvis + Learning Coach** only.

## Future Direction

The next major direction for this project is to move beyond the phone and integrate Jarvis into wearable devices such as **Meta glasses**.

That would make Jarvis much closer to a real ambient assistant:

- always available through voice
- visually aware through a first-person camera view
- capable of guiding users hands-free in real time
- able to deliver Learning Coach experiences in a more immersive way

Instead of opening the app and manually switching into a session, Jarvis could live in the user’s field of view and help with:

- contextual guidance
- visual understanding of the environment
- session planning on the go
- real-time prompts during guided practice

The phone version proves the interaction model today. The wearable direction is where Jarvis becomes a persistent AI companion rather than just an app.
