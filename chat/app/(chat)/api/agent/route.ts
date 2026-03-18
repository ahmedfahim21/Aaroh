import { NextRequest, NextResponse } from "next/server";
import { runningProcesses } from "@/lib/merchant-processes";

const AGENT_URL = process.env.AGENT_URL ?? "http://localhost:8004";

export async function GET() {
  const res = await fetch(`${AGENT_URL}/identity`, { cache: "no-store" });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest) {
  const { task } = await req.json();

  // Inject currently running merchants so the agent can discover them
  const available_merchants = [...runningProcesses.values()].map((p) => ({
    name: p.slug,
    url: `http://localhost:${p.port}`,
  }));

  const res = await fetch(`${AGENT_URL}/shop`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task, available_merchants }),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
