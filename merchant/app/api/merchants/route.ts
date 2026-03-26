import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { NextResponse } from "next/server";
import { createMerchant, listMerchants } from "@/lib/db/queries-merchants";
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
  // Filesystem merchants (deployed)
  const fsMerchants: MerchantInfo[] = [];
  if (existsSync(DEPLOY_DIR)) {
    const entries = readdirSync(DEPLOY_DIR, { withFileTypes: true }).filter(
      (e) => e.isDirectory()
    );
    for (const entry of entries) {
      const slug = entry.name;
      const dir = join(DEPLOY_DIR, slug);
      const profilePath = join(dir, "discovery_profile.json");
      const productsDb = join(dir, "data", "products.db");

      let name = slug;
      let categories: string[] = [];

      if (existsSync(profilePath)) {
        try {
          const profile = JSON.parse(readFileSync(profilePath, "utf-8"));
          name = profile?.merchant?.name ?? slug;
          const cats = profile?.merchant?.product_categories ?? "";
          categories = parseCommaSeparated(cats);
        } catch {
          /* ignore invalid discovery_profile.json */
        }
      }

      const proc = runningProcesses.get(slug);
      fsMerchants.push({
        slug,
        name,
        categories,
        tags: [],
        description: "",
        hasProducts: existsSync(productsDb),
        running: !!proc,
        port: proc?.port ?? null,
        startedAt: proc?.startedAt ?? null,
      });
    }
  }

  // DB merchants (onboarded via UI)
  let dbMerchants: MerchantInfo[] = [];
  try {
    const rows = await listMerchants();
    dbMerchants = rows.map((m) => {
      const proc = runningProcesses.get(m.slug);
      const dir = join(DEPLOY_DIR, m.slug);
      const productsDb = join(dir, "data", "products.db");
      return {
        slug: m.slug,
        name: m.name,
        categories: parseCommaSeparated(m.categories),
        tags: parseCommaSeparated(m.tags),
        description: m.description ?? "",
        hasProducts: existsSync(productsDb),
        running: !!proc,
        port: proc?.port ?? null,
        startedAt: proc?.startedAt ?? null,
      };
    });
  } catch {
    // DB might not be available yet; fall through
  }

  // Merge: DB entries take precedence, FS-only entries appended
  const seen = new Set(dbMerchants.map((m) => m.slug));
  const merged = [
    ...dbMerchants,
    ...fsMerchants.filter((m) => !seen.has(m.slug)),
  ];

  return NextResponse.json(merged);
}

export async function POST(req: Request) {
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
      categories: categories ?? "",
      tags: typeof tags === "string" ? tags : "",
      description: typeof description === "string" ? description : "",
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("unique")) {
      return NextResponse.json(
        { error: "Merchant slug already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
