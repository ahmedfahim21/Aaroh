import { agentBackendHeaders, AGENT_URL } from "@/lib/agent-backend";
import { NextResponse } from "next/server";

export async function GET() {
  const res = await fetch(`${AGENT_URL}/tasks`, {
    cache: "no-store",
    headers: agentBackendHeaders(false),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
