import { auth } from "@/app/(auth)/auth";
import { AGENT_URL, agentBackendHeaders } from "@/lib/agent-backend";
import { getAgentById } from "@/lib/db/queries-agents";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
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

  const url = new URL(`${AGENT_URL}/agents/${id}/manifest`);
  if (ag.erc8004Id) {
    url.searchParams.set("erc8004_id", ag.erc8004Id);
  }
  const operatorWallet = req.headers.get("x-operator-wallet");
  if (operatorWallet) {
    url.searchParams.set("operator_wallet", operatorWallet);
  }
  const upstream = await fetch(url.toString(), {
    headers: agentBackendHeaders(false),
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    return NextResponse.json(
      { error: (data as { detail?: string; error?: string }).detail ?? "manifest fetch failed" },
      { status: upstream.status },
    );
  }
  return NextResponse.json(data);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
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
  if (!ag.erc8004Id) {
    return NextResponse.json(
      { error: "Agent is not registered on-chain yet." },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { operatorWallet?: string };
  const upstream = await fetch(`${AGENT_URL}/agents/${id}/publish-manifest`, {
    method: "POST",
    headers: agentBackendHeaders(),
    body: JSON.stringify({
      erc8004_id: Number.parseInt(ag.erc8004Id, 10),
      operator_wallet: body.operatorWallet ?? null,
    }),
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    return NextResponse.json(
      { error: (data as { detail?: string; error?: string }).detail ?? "manifest publish failed" },
      { status: upstream.status },
    );
  }
  return NextResponse.json(data);
}
