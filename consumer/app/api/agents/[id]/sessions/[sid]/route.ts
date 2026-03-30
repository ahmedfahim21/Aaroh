import { auth } from "@/app/(auth)/auth";
import { getAgentById, getSessionById, rateSession } from "@/lib/db/queries-agents";
import { NextResponse } from "next/server";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; sid: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: agentId, sid } = await params;
  const ag = await getAgentById(agentId, session.user.id);
  if (!ag) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const row = await getSessionById(sid);
  if (!row || row.agentId !== agentId) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const body = await req.json();
  const { rating } = body as { rating?: "up" | "down" };
  if (rating !== "up" && rating !== "down") {
    return NextResponse.json({ error: "rating must be 'up' or 'down'" }, { status: 400 });
  }

  const updated = await rateSession(sid, agentId, rating === "up");
  if (!updated) {
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
  return NextResponse.json(updated);
}
