import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import {
  createMerchant,
  listMerchantsByOwner,
} from "@/lib/db/queries-merchants";
import { runningProcesses } from "@/lib/merchant-processes";

const REPO_ROOT = resolve(process.cwd(), "..");
const DEPLOY_DIR = join(REPO_ROOT, "deploy");

function parseCommaSeparated(str: string | null | undefined): string[] {
  return str
    ? str
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
}

export interface MerchantInfo {
  slug: string;
  name: string;
  categories: string[];
  tags: string[];
  description: string;
  hasProducts: boolean;
  running: boolean;
  port: number | null;
  startedAt: string | null;
}

export async function GET() {
  const user = await getSessionUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let dbMerchants: MerchantInfo[] = [];
  try {
    const rows = await listMerchantsByOwner(user.id);
    dbMerchants = rows.map((m) => {
      const proc = runningProcesses.get(m.slug);
      const dir = join(DEPLOY_DIR, m.slug);
      const productsDb = join(dir, "data", "products.db");
      let name = m.name;
      let categories = parseCommaSeparated(m.categories);

      const profilePath = join(dir, "discovery_profile.json");
      if (existsSync(profilePath)) {
        try {
          const profile = JSON.parse(readFileSync(profilePath, "utf-8"));
          name = profile?.merchant?.name ?? m.name;
          const cats = profile?.merchant?.product_categories ?? m.categories;
          categories = parseCommaSeparated(
            typeof cats === "string" ? cats : m.categories
          );
        } catch {
          /* ignore invalid discovery_profile.json */
        }
      }

      return {
        slug: m.slug,
        name,
        categories,
        tags: parseCommaSeparated(m.tags),
        description: m.description ?? "",
        hasProducts: existsSync(productsDb),
        running: !!proc,
        port: proc?.port ?? null,
        startedAt: proc?.startedAt ?? null,
      };
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to load merchants." },
      { status: 500 }
    );
  }

  return NextResponse.json(dbMerchants);
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { slug, name, walletAddress, categories, tags, description } = body;
  if (!slug || !name || !walletAddress) {
    return NextResponse.json(
      { error: "slug, name, walletAddress are required" },
      { status: 400 }
    );
  }
  try {
    const created = await createMerchant({
      slug,
      name,
      walletAddress,
      ownerId: user.id,
      categories: categories ?? "",
      tags: typeof tags === "string" ? tags : "",
      description: typeof description === "string" ? description : "",
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return NextResponse.json(
        { error: "Merchant slug already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
