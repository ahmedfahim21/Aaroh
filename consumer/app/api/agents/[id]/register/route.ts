import { auth } from "@/app/(auth)/auth";
import { agentBackendHeaders, AGENT_URL } from "@/lib/agent-backend";
import { getAgentById, updateAgentErc8004Id } from "@/lib/db/queries-agents";
import { NextResponse } from "next/server";

export async function POST(
  req: Request,
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

  try {
    const res = await fetch(`${AGENT_URL}/agents/${id}/register`, {
      method: "POST",
      headers: agentBackendHeaders(),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { detail?: string; error?: string };
      const msg = typeof err.detail === "string" ? err.detail : err.error ?? "agent registration failed";
      return NextResponse.json({ error: msg }, { status: res.status >= 400 && res.status < 600 ? res.status : 502 });
    }
    const data = (await res.json()) as { erc8004_id: number };
    const erc8004Id = String(data.erc8004_id);
    await updateAgentErc8004Id(id, erc8004Id);

    // Auto-publish manifest to IPFS and set on-chain tokenURI when possible.
    const body = (await req.json().catch(() => ({}))) as { operatorWallet?: string };
    try {
      await fetch(`${AGENT_URL}/agents/${id}/publish-manifest`, {
        method: "POST",
        headers: agentBackendHeaders(),
        body: JSON.stringify({
          erc8004_id: Number.parseInt(erc8004Id, 10),
          operator_wallet: body.operatorWallet ?? null,
        }),
      });
    } catch {
      // Best-effort; registration already succeeded.
    }

    const updated = await getAgentById(id, session.user.id);
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: `Cannot reach agent: ${e}` }, { status: 502 });
  }
}
