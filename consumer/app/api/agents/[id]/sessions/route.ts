import { auth } from "@/app/(auth)/auth";
import { agentBackendHeaders, AGENT_URL } from "@/lib/agent-backend";
import { createSession, getAgentById, listSessionsByAgentId } from "@/lib/db/queries-agents";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const ag = await getAgentById(id, session.user.id);
  if (!ag) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const sessions = await listSessionsByAgentId(id);
  return NextResponse.json(sessions);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const ag = await getAgentById(id, session.user.id);
  if (!ag) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const { task, availableMerchants } = body;

  if (!task) {
    return NextResponse.json({ error: "task is required" }, { status: 400 });
  }

  let erc8004AgentId: number | null = null;
  if (ag.erc8004Id) {
    const n = Number.parseInt(ag.erc8004Id, 10);
    if (!Number.isNaN(n)) {
      erc8004AgentId = n;
    }
  }

  let agentTaskId: string;
  try {
    const shopRes = await fetch(`${AGENT_URL}/shop`, {
      method: "POST",
      headers: agentBackendHeaders(),
      body: JSON.stringify({
        task,
        available_merchants: availableMerchants ?? [],
        consumer_agent_id: id,
        erc8004_agent_id: erc8004AgentId,
      }),
    });
    if (!shopRes.ok) {
      const err = await shopRes.json().catch(() => ({}));
      return NextResponse.json({ error: (err as { detail?: string }).detail ?? "agent.py error" }, { status: 502 });
    }
    const shopData = (await shopRes.json()) as { task_id: string };
    agentTaskId = shopData.task_id;
  } catch (e) {
    return NextResponse.json({ error: `Cannot reach agent: ${e}` }, { status: 502 });
  }

  const row = await createSession({ id: agentTaskId, agentId: id, task });
  return NextResponse.json(row, { status: 201 });
}
