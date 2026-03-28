import { auth } from "@/app/(auth)/auth";
import { agentBackendHeaders, AGENT_URL } from "@/lib/agent-backend";
import { getAgentById, getSessionById, updateSession } from "@/lib/db/queries-agents";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; sid: string }> }
) {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { id: agentId, sid } = await params;
  const ag = await getAgentById(agentId, authSession.user.id);
  if (!ag) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  const session = await getSessionById(sid);
  if (!session || session.agentId !== agentId) {
    return new Response(JSON.stringify({ error: "Session not found" }), { status: 404 });
  }

  // If already finished, replay stored events
  if (session.status !== "running") {
    const stored = session.events as Record<string, unknown>[];
    const lines = stored.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
    return new Response(lines, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
    });
  }

  const headers: Record<string, string> = {
    accept: "text/event-stream",
    ...agentBackendHeaders(false),
  };

  const upstream = await fetch(`${AGENT_URL}/tasks/${sid}/events`, { headers });

  if (!upstream.ok || !upstream.body) {
    return new Response("data: " + JSON.stringify({ type: "done", success: false, result: "Agent unreachable" }) + "\n\n", {
      headers: { "content-type": "text/event-stream" },
    });
  }

  const accumulatedEvents: Record<string, unknown>[] = [];

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  (async () => {
    const reader = upstream.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        await writer.write(value);

        buffer += chunk;
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const dataLine = part.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          try {
            const evt = JSON.parse(dataLine.slice(6));
            if (evt.type !== "keepalive") {
              accumulatedEvents.push(evt);
            }
            if (evt.type === "done") {
              await updateSession(sid, {
                status: evt.success ? "done" : "failed",
                result: evt.result ?? null,
                events: accumulatedEvents,
                completedAt: new Date(),
              });
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch {
      // browser disconnected or upstream closed
    } finally {
      try {
        await writer.close();
      } catch {
        /* ignore */
      }
    }
  })();

  return new Response(readable, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}
