"use client";

import { useEffect, useRef, useState } from "react";

export type AgentEvent =
  | { type: "thinking" }
  | { type: "tool_call"; tool: string; args: Record<string, unknown> }
  | {
      type: "tool_result";
      tool: string;
      result: string;
      result_data?: Record<string, unknown>;
    }
  | { type: "text"; text: string }
  | { type: "log"; level: string; msg: string }
  | {
      type: "done";
      success: boolean;
      result: string;
      /** submit_payment envelope or merchant checkout — tx_url, cart_summary, nested order */
      order?: Record<string, unknown> | null;
    }
  | { type: "keepalive" };

export function useTaskSSE(taskId: string | null, eventsUrl?: string) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [done, setDone] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!taskId) return;

    setEvents([]);
    setDone(false);

    const url = eventsUrl ?? `/api/agent/tasks/${taskId}/events`;
    const es = new EventSource(url);
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
  }, [taskId, eventsUrl]);

  return { events, done };
}
