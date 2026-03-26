import { NextResponse } from "next/server";
import { createAgent, listAgents } from "@/lib/db/queries-agents";

export async function GET() {
  const agents = await listAgents();
  return NextResponse.json(agents);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { id, name, instructions, walletAddress } = body;
  if (!id || !name || !walletAddress) {
    return NextResponse.json({ error: "id, name, walletAddress are required" }, { status: 400 });
  }
  const created = await createAgent({ id, name, instructions: instructions ?? "", walletAddress });
  return NextResponse.json(created, { status: 201 });
}
