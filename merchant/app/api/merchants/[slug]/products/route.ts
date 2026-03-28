import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { getMerchantBySlugForOwner } from "@/lib/db/queries-merchants";
import { runningProcesses } from "@/lib/merchant-processes";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await getSessionUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const owned = await getMerchantBySlugForOwner(slug, user.id);
  if (!owned) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const proc = runningProcesses.get(slug);
  if (!proc) {
    return NextResponse.json(
      { error: "Merchant server is not running." },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`http://localhost:${proc.port}/products-inventory`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error(
      `Failed to fetch products from merchant server for slug "${slug}":`,
      error
    );
    return NextResponse.json(
      { error: "Failed to fetch products from merchant server." },
      { status: 502 }
    );
  }
}
