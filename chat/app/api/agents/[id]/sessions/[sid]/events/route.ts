import { getSessionById, updateSession } from "@/lib/db/queries-agents";

const AGENT_URL = process.env.AGENT_URL ?? "http://localhost:8004";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; sid: string }> }
) {
  const { sid } = await params;
  const session = await getSessionById(sid);
  if (!session) {
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

  // Proxy SSE from agent.py with tee to DB write-back
  const upstream = await fetch(`${AGENT_URL}/tasks/${sid}/events`, {
    headers: { accept: "text/event-stream" },
  });

  if (!upstream.ok || !upstream.body) {
    return new Response("data: " + JSON.stringify({ type: "done", success: false, result: "Agent unreachable" }) + "\n\n", {
      headers: { "content-type": "text/event-stream" },
    });
  }

  const accumulatedEvents: Record<string, unknown>[] = [];

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  // Drain upstream in background, tee to writer + accumulate for DB
  (async () => {
    const reader = upstream.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        // Forward raw bytes to browser
        await writer.write(value);

        // Parse SSE lines for DB accumulation
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
      try { await writer.close(); } catch { /* ignore */ }
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
