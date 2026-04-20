import { NextResponse } from "next/server";

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

export async function GET() {
  return withCors({
    ok: true,
    service: "taskrunner",
    status: "ready",
    timestamp: new Date().toISOString(),
  });
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
