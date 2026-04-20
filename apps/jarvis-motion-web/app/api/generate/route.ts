import { NextRequest } from "next/server";
import { mkdir } from "fs/promises";
import path from "path";
import OpenAI from "openai";

const VIDEO_DIR = "/tmp/jarvis-motion";
const SYNTHESIS_TIMEOUT_MS = 20000;

function sse(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function classifyPrompt(prompt: string): "dance" | "gym" {
  const lower = prompt.toLowerCase();
  const danceKeywords = [
    "dance",
    "choreography",
    "choreo",
    "moves",
    "groove",
    "hip hop",
    "ballet",
    "salsa",
    "tango",
  ];
  const gymKeywords = [
    "workout",
    "exercise",
    "fitness",
    "muscle",
    "reps",
    "sets",
    "hiit",
    "core",
    "abs",
    "leg",
    "arm",
    "chest",
    "back",
    "squat",
    "push",
    "pull",
    "cardio",
    "yoga",
    "stretch",
    "warm up",
    "cool down",
  ];

  const danceScore = danceKeywords.filter((k) => lower.includes(k)).length;
  const gymScore = gymKeywords.filter((k) => lower.includes(k)).length;

  return danceScore > gymScore ? "dance" : "gym";
}

async function synthesizeRoutineDescription(
  openai: OpenAI,
  prompt: string,
): Promise<string> {
  const synthesisPrompt = `You are a fitness and movement expert. Based on the user's request, create a detailed visual description for a single 10-second video clip.

USER REQUEST: "${prompt}"

Use your own movement and exercise knowledge.

Create a vivid, detailed description of a single continuous video showing a person performing the exercise or movement. STRICT REQUIREMENTS:
- STATIC CAMERA: The camera must be completely stationary and fixed in place. No panning, zooming, tracking, or camera movement of any kind. Use a locked-off front-facing medium shot.
- PLAIN BACKGROUND: The setting must be a clean white studio or a plain white/light gray wall. No gym equipment, no windows, no decorations, just a minimal, distraction-free background.
- Show the full body of the person from head to toe, centered in frame.
- The person performs the movements with clear, deliberate form.

Keep the description under 200 words. The video will be 15 seconds long. Be specific and visual because this will be used to generate a video.`;

  const fallbackDescription =
    `A person performing ${prompt} in a clean white studio with a plain white background, static locked-off camera, full body visible head to toe, demonstrating proper form with clear slow movements.`;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error("Synthesis timed out")),
        SYNTHESIS_TIMEOUT_MS,
      );
    });

    const completion = await Promise.race([
      openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: synthesisPrompt }],
        max_tokens: 300,
        temperature: 0.7,
      }),
      timeoutPromise,
    ]);

    return completion.choices[0]?.message?.content?.trim() || fallbackDescription;
  } catch {
    return fallbackDescription;
  }
}

export async function POST(request: NextRequest) {
  const { prompt } = (await request.json()) as { prompt: string };

  if (!prompt || prompt.trim().length < 3) {
    return new Response(JSON.stringify({ error: "Prompt too short" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  await mkdir(VIDEO_DIR, { recursive: true });

  const genId = `gen_${Date.now()}`;
  const outputPath = path.join(VIDEO_DIR, `${genId}.mp4`);
  const mode = classifyPrompt(prompt);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const emit = (data: Record<string, unknown>) => {
        if (!closed) {
          controller.enqueue(encoder.encode(sse(data)));
        }
      };
      const close = () => {
        if (!closed) {
          closed = true;
          controller.close();
        }
      };

      try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          throw new Error("OPENAI_API_KEY not configured");
        }

        const openai = new OpenAI({ apiKey });

        emit({ type: "genId", id: genId });
        emit({ type: "classified", mode, title: prompt });

        emit({ type: "progress", percent: 25, phase: "synthesizing" });
        const videoDescription = await synthesizeRoutineDescription(openai, prompt);
        emit({ type: "progress", percent: 50, phase: "synthesizing" });
        emit({ type: "synthesis", description: videoDescription });

        emit({ type: "progress", percent: 55, phase: "generating" });

        let video = await (openai as any).videos.create({
          model: "sora-2",
          prompt: videoDescription,
          seconds: "8",
          size: "720x1280",
        });

        emit({ type: "progress", percent: 60, phase: "generating" });

        while (video.status === "queued" || video.status === "in_progress") {
          await new Promise((r) => setTimeout(r, 5000));
          video = await (openai as any).videos.retrieve(video.id);
          emit({
            type: "progress",
            percent: Math.max(65, Math.min(90, video.progress ?? 70)),
            phase: "generating",
          });
        }

        if (video.status !== "completed") {
          throw new Error(`Video generation failed with status ${video.status}`);
        }

        emit({ type: "progress", percent: 85, phase: "downloading" });

        const content = await (openai as any).videos.downloadContent(video.id);
        const buffer = Buffer.from(await content.arrayBuffer());
        const { writeFile } = await import("fs/promises");
        await writeFile(outputPath, buffer);

        emit({ type: "progress", percent: 100, phase: "done" });
        emit({ type: "done" });
      } catch (err) {
        emit({
          type: "error",
          message: err instanceof Error ? err.message : "Generation failed",
        });
      }

      close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
