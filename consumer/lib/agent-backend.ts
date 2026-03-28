const AGENT_URL = process.env.AGENT_URL ?? "http://localhost:8004";
const AGENT_API_SECRET = process.env.AGENT_API_SECRET?.trim();

/** Headers for authenticated calls to agent.py (FastAPI). */
export function agentBackendHeaders(contentTypeJson = true): Record<string, string> {
  const h: Record<string, string> = {};
  if (contentTypeJson) {
    h["Content-Type"] = "application/json";
  }
  if (AGENT_API_SECRET) {
    h.Authorization = `Bearer ${AGENT_API_SECRET}`;
  }
  return h;
}

export { AGENT_URL };
