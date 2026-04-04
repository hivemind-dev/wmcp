import { NextRequest, NextResponse } from "next/server";

/**
 * In-memory store for the counter. Implements the host:requires endpoints:
 *   GET  /api/counter  -> persist:load
 *   POST /api/counter  -> persist:save
 */
let stored = 0;

export async function GET() {
  return NextResponse.json({ value: stored });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (typeof body.value === "number") {
    stored = body.value;
  }
  return NextResponse.json({ value: stored });
}
