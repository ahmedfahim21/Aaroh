import { auth } from "@/app/(auth)/auth";
import { AGENT_URL, agentBackendHeaders } from "@/lib/agent-backend";
import { getAgentById } from "@/lib/db/queries-agents";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
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
  if (!ag.erc8004Id) {
    return NextResponse.json({ error: "Agent is not registered" }, { status: 400 });
  }

  const upstream = await fetch(
    `${AGENT_URL}/agents/${id}/token-uri?erc8004_id=${encodeURIComponent(ag.erc8004Id)}`,
    { headers: agentBackendHeaders(false) },
  );
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    return NextResponse.json(
      { error: (data as { detail?: string; error?: string }).detail ?? "token URI fetch failed" },
      { status: upstream.status },
    );
  }
  return NextResponse.json(data);
}
