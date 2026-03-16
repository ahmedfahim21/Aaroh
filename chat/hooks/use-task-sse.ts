"use client";

import { useEffect, useRef, useState } from "react";

export type AgentEvent =
  | { type: "thinking" }
  | { type: "tool_call"; tool: string; args: Record<string, unknown> }
  | { type: "tool_result"; tool: string; result: string }
  | { type: "text"; text: string }
  | { type: "log"; level: string; msg: string }
  | { type: "done"; success: boolean; result: string }
  | { type: "keepalive" };

export function useTaskSSE(taskId: string | null) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [done, setDone] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!taskId) return;

    setEvents([]);
    setDone(false);

    const es = new EventSource(`/api/agent/tasks/${taskId}/events`);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data) as AgentEvent;
        if (evt.type === "keepalive") return;
        setEvents((prev) => [...prev, evt]);
        if (evt.type === "done") {
          setDone(true);
          es.close();
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      setDone(true);
      es.close();
    };

    return () => {
      es.close();
    };
  }, [taskId]);

  return { events, done };
}
