import { NextRequest, NextResponse } from "next/server";

const AGENT_URL = process.env.AGENT_URL ?? "http://localhost:8004";

export async function GET() {
  const res = await fetch(`${AGENT_URL}/identity`, { cache: "no-store" });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest) {
  const { task, merchant_url } = await req.json();

  const res = await fetch(`${AGENT_URL}/shop`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task, merchant_url }),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
