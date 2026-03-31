import { auth } from "@/app/(auth)/auth";
import { AGENT_URL, agentBackendHeaders } from "@/lib/agent-backend";
import { getAgentById, getSessionById } from "@/lib/db/queries-agents";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; sid: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, sid } = await params;
  const ag = await getAgentById(id, session.user.id);
  if (!ag) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const row = await getSessionById(sid);
  if (!row || row.agentId !== id) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const upstream = await fetch(`${AGENT_URL}/tasks/${sid}/log`, {
    headers: agentBackendHeaders(false),
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    return NextResponse.json(
      { error: (data as { detail?: string; error?: string }).detail ?? "task log unavailable" },
      { status: upstream.status },
    );
  }
  return NextResponse.json(data);
}
