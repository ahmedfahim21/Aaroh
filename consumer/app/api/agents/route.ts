import { auth } from "@/app/(auth)/auth";
import { agentBackendHeaders, AGENT_URL } from "@/lib/agent-backend";
import { createAgent, listAgentsForUser } from "@/lib/db/queries-agents";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const agents = await listAgentsForUser(session.user.id);
  return NextResponse.json(agents);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, instructions } = body;
  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const id = crypto.randomUUID();

  let walletAddress: string;
  let erc8004Id: string | null = null;

  try {
    const res = await fetch(`${AGENT_URL}/agents`, {
      method: "POST",
      headers: agentBackendHeaders(),
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { detail?: string; error?: string };
      const msg = typeof err.detail === "string" ? err.detail : err.error ?? "agent server error";
      return NextResponse.json({ error: msg }, { status: res.status >= 400 && res.status < 600 ? res.status : 502 });
    }
    const data = (await res.json()) as { address: string; erc8004_id: number | null };
    walletAddress = data.address;
    if (data.erc8004_id != null) {
      erc8004Id = String(data.erc8004_id);
    }
  } catch (e) {
    return NextResponse.json({ error: `Cannot reach agent: ${e}` }, { status: 502 });
  }

  const created = await createAgent({
    id,
    userId: session.user.id,
    name: name.trim(),
    instructions: typeof instructions === "string" ? instructions.trim() : "",
    walletAddress,
    erc8004Id,
  });
  return NextResponse.json(created, { status: 201 });
}
