# Jiggle Wiggle

Real-time AI dance and fitness coaching from any YouTube video.

## What it does

Paste any YouTube dance or workout video. Your webcam tracks your body in real time, scores every move against the reference, and an AI coach gives live audio feedback. When the video ends, you get a report card.

## Core features

- Auto mode detection for dance vs gym
- Real-time pose scoring with geometric comparison plus OpenAI vision scoring
- Score popups and combo streaks
- AI coach with OpenAI text + TTS
- Gesture controls
- Person segmentation
- AI video generation using OpenAI prompt synthesis and OpenAI video generation
- Performance report card
- Move queue
- Chrome extension support

## Prerequisites

- Node.js 18+
- `yt-dlp` and `ffmpeg` installed and on PATH
- OpenAI API key

## Environment variables

Create `.env.local`:

```env
OPENAI_API_KEY=sk-...
```

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Tech stack

- Next.js 16
- React 19
- TypeScript
- MediaPipe Pose
- OpenAI for coaching, scoring, reports, and generation
- Modal SAM2 for segmentation
