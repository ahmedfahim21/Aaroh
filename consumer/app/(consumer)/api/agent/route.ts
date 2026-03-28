import { agentBackendHeaders, AGENT_URL } from "@/lib/agent-backend";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const res = await fetch(`${AGENT_URL}/identity`, {
    cache: "no-store",
    headers: agentBackendHeaders(false),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest) {
  const { task, merchant_url } = await req.json();

  const res = await fetch(`${AGENT_URL}/shop`, {
    method: "POST",
    headers: agentBackendHeaders(),
    body: JSON.stringify({ task, merchant_url }),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
