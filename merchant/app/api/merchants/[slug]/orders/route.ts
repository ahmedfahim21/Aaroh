import { NextResponse } from "next/server";
import { runningProcesses } from "@/lib/merchant-processes";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const proc = runningProcesses.get(slug);
  if (!proc) {
    return NextResponse.json(
      { error: "Merchant server is not running." },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`http://localhost:${proc.port}/orders`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch orders from merchant server." },
      { status: 502 }
    );
  }
}
