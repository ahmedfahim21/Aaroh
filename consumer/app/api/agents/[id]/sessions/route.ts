import { NextResponse } from "next/server";
import { createSession, listSessionsByAgentId } from "@/lib/db/queries-agents";

const AGENT_URL = process.env.AGENT_URL ?? "http://localhost:8004";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sessions = await listSessionsByAgentId(id);
  return NextResponse.json(sessions);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { task, agentPrivateKey, availableMerchants } = body;

  if (!task) {
    return NextResponse.json({ error: "task is required" }, { status: 400 });
  }

  // Forward to agent.py /shop
  let agentTaskId: string;
  try {
    const shopRes = await fetch(`${AGENT_URL}/shop`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        task,
        available_merchants: availableMerchants ?? [],
        agent_private_key: agentPrivateKey ?? null,
      }),
    });
    if (!shopRes.ok) {
      const err = await shopRes.json().catch(() => ({}));
      return NextResponse.json({ error: err.detail ?? "agent.py error" }, { status: 502 });
    }
    const shopData = await shopRes.json();
    agentTaskId = shopData.task_id;
  } catch (e) {
    return NextResponse.json({ error: `Cannot reach agent: ${e}` }, { status: 502 });
  }

  // Create session in DB using the agent.py task_id as the session id
  const session = await createSession({ id: agentTaskId, agentId: id, task });
  return NextResponse.json(session, { status: 201 });
}
