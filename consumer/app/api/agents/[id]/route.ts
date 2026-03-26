import { NextResponse } from "next/server";
import { getAgentById, deleteAgent } from "@/lib/db/queries-agents";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ag = await getAgentById(id);
  if (!ag) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(ag);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await deleteAgent(id);
  return NextResponse.json({ ok: true });
}
