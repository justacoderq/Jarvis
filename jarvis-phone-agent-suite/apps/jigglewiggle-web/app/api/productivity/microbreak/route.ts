import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

function fallbackRoutine(prompt: string, minutes: number) {
  const lower = prompt.toLowerCase();
  const mode =
    lower.includes("neck") ||
    lower.includes("desk") ||
    lower.includes("posture") ||
    lower.includes("stretch")
      ? "mobility"
      : "gym";

  return {
    title: mode === "mobility" ? "Desk Reset Break" : "Energy Reset Break",
    summary:
      mode === "mobility"
        ? "A short posture and mobility reset to reduce stiffness and restore focus."
        : "A quick movement break to wake up your body and improve concentration.",
    steps:
      mode === "mobility"
        ? [
            "Roll your shoulders slowly for 20 seconds.",
            "Do gentle neck turns and side stretches.",
            "Reach overhead, then fold forward with soft knees.",
            "Stand tall and take five slow deep breaths.",
          ]
        : [
            "March in place for 30 seconds.",
            "Do 10 bodyweight squats with controlled tempo.",
            "Reach up, then alternate side bends.",
            "Finish with five deep breaths and shoulder rolls.",
          ],
    minutes,
    mode,
  };
}

export async function POST(request: NextRequest) {
  const { prompt, minutes } = (await request.json()) as {
    prompt?: string;
    minutes?: number;
  };

  const normalizedPrompt = prompt?.trim() || "a desk posture reset";
  const duration = Math.max(1, Math.min(10, minutes ?? 3));
  const fallback = fallbackRoutine(normalizedPrompt, duration);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(fallback);
  }

  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You design short movement breaks for productivity. Return JSON with keys: title, summary, steps, minutes, mode. Keep steps concise and actionable.",
        },
        {
          role: "user",
          content:
            `Create a ${duration}-minute productivity micro-break for this request: "${normalizedPrompt}". ` +
            "Prioritize focus, posture, mobility, and desk-friendly movement.",
        },
      ],
      temperature: 0.7,
      max_tokens: 250,
    });

    const text = completion.choices[0]?.message?.content;
    if (!text) {
      return NextResponse.json(fallback);
    }

    const parsed = JSON.parse(text) as Record<string, unknown>;
    return NextResponse.json({
      title: String(parsed.title ?? fallback.title),
      summary: String(parsed.summary ?? fallback.summary),
      steps: Array.isArray(parsed.steps)
        ? parsed.steps.map((step) => String(step))
        : fallback.steps,
      minutes: Number(parsed.minutes ?? duration),
      mode: String(parsed.mode ?? fallback.mode),
    });
  } catch {
    return NextResponse.json(fallback);
  }
}
