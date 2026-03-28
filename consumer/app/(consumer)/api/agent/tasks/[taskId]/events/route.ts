import { agentBackendHeaders, AGENT_URL } from "@/lib/agent-backend";
import { NextRequest } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const upstream = await fetch(`${AGENT_URL}/tasks/${taskId}/events`, {
    headers: { Accept: "text/event-stream", ...agentBackendHeaders(false) },
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    return new Response("Task not found", { status: 404 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
