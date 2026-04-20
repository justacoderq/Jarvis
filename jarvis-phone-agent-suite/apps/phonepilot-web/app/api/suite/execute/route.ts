import { NextRequest, NextResponse } from "next/server";
import { executeGoalWithPhonePilot } from "../../../../mastra/agents/phonepilot-agent";

function withCors(body: Record<string, unknown>, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      ...(init?.headers ?? {}),
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const goal = body.goal?.toString().trim();
    const deviceSerial = body.deviceSerial?.toString();
    const maxSteps = body.maxSteps ? Number(body.maxSteps) : undefined;

    if (!goal) {
      return withCors({ success: false, error: "Missing goal" }, { status: 400 });
    }

    const result = await executeGoalWithPhonePilot(goal, maxSteps, deviceSerial);
    return withCors({
      success: !!result.success,
      summary: result.summary ?? result.error ?? "Goal execution finished.",
      result,
    });
  } catch (error: any) {
    return withCors(
      { success: false, error: error?.message ?? "PhonePilot execution failed" },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    },
  });
}
