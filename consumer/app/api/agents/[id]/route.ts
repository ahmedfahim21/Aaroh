import { auth } from "@/app/(auth)/auth";
import { agentBackendHeaders, AGENT_URL } from "@/lib/agent-backend";
import {
  deleteAgentForUser,
  getAgentById,
  getSessionRatingSummary,
} from "@/lib/db/queries-agents";
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
  const rating = await getSessionRatingSummary(id);
  return NextResponse.json({ ...ag, rating });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const removed = await deleteAgentForUser(id, session.user.id);
  if (!removed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await fetch(`${AGENT_URL}/agents/${id}`, {
      method: "DELETE",
      headers: agentBackendHeaders(false),
    });
  } catch {
    // Best-effort: DB row is already gone
  }

  return NextResponse.json({ ok: true });
}
