import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { getMerchantBySlugForOwner } from "@/lib/db/queries-merchants";
import {
  appendLog,
  getNextPort,
  runningProcesses,
} from "@/lib/merchant-processes";

const REPO_ROOT = resolve(process.cwd(), "..");
const DEPLOY_DIR = join(REPO_ROOT, "deploy");
const SERVER_DIR = join(REPO_ROOT, "rest", "python", "server");

export async function POST(
  req: Request,
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

  const { action } = (await req.json()) as { action: "start" | "stop" };
  const deployDir = join(DEPLOY_DIR, slug);

  if (!existsSync(deployDir)) {
    return NextResponse.json(
      { error: `Merchant "${slug}" not found.` },
      { status: 404 }
    );
  }

  // ── STOP ────────────────────────────────────────────────────────────────────
  if (action === "stop") {
    const entry = runningProcesses.get(slug);
    if (!entry) {
      return NextResponse.json({ error: "Not running." }, { status: 400 });
    }
    entry.process.kill("SIGTERM");
    runningProcesses.delete(slug);
    return NextResponse.json({ status: "stopped" });
  }

  // ── START ────────────────────────────────────────────────────────────────────
  if (action === "start") {
    const alreadyRunning = runningProcesses.get(slug);
    if (alreadyRunning) {
      return NextResponse.json({
        status: "already_running",
        port: alreadyRunning.port,
      });
    }

    const productsDb = join(deployDir, "data", "products.db");
    const transactionsDb = join(deployDir, "data", "transactions.db");
    const discoveryProfile = join(deployDir, "discovery_profile.json");

    for (const path of [productsDb, transactionsDb, discoveryProfile]) {
      if (!existsSync(path)) {
        return NextResponse.json(
          { error: `Missing required file: ${path}` },
          { status: 422 }
        );
      }
    }

    const port = getNextPort();

    // Read merchant wallet from discovery profile to pass as env var
    let merchantWallet = "";
    try {
      const profile = JSON.parse(readFileSync(discoveryProfile, "utf8"));
      const handlers: Array<{
        id?: string;
        config?: { wallet_address?: string };
      }> = profile?.payment?.handlers ?? [];
      merchantWallet =
        handlers.find((h) => h.id === "evm")?.config?.wallet_address ?? "";
    } catch {
      // profile unreadable — x402 will be disabled
    }

    const child = spawn(
      "uv",
      [
        "run",
        "server.py",
        `--products_db_path=${productsDb}`,
        `--transactions_db_path=${transactionsDb}`,
        `--discovery_profile_path=${discoveryProfile}`,
        `--port=${port}`,
      ],
      {
        cwd: SERVER_DIR,
        detached: false,
        env: {
          ...process.env,
          ...(merchantWallet ? { MERCHANT_WALLET: merchantWallet } : {}),
        },
      }
    );

    runningProcesses.set(slug, {
      process: child,
      port,
      slug,
      startedAt: new Date().toISOString(),
      logs: [],
    });

    child.stdout?.on("data", (d: Buffer) => {
      for (const line of d.toString().split("\n").filter(Boolean)) {
        appendLog(slug, line);
      }
    });
    child.stderr?.on("data", (d: Buffer) => {
      for (const line of d.toString().split("\n").filter(Boolean)) {
        appendLog(slug, line);
      }
    });
    child.on("exit", (code) => {
      appendLog(slug, `[process exited with code ${code}]`);
      runningProcesses.delete(slug);
    });

    // Give the server ~500ms to fail fast (e.g. port conflict)
    await new Promise((r) => setTimeout(r, 500));

    if (!runningProcesses.has(slug)) {
      const logs = runningProcesses.get(slug)?.logs ?? [];
      return NextResponse.json(
        { error: "Server failed to start.", logs },
        { status: 500 }
      );
    }

    return NextResponse.json({ status: "started", port });
  }

  return NextResponse.json({ error: "Invalid action." }, { status: 400 });
}

// GET logs for a merchant
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

  const entry = runningProcesses.get(slug);
  return NextResponse.json({
    running: !!entry,
    port: entry?.port ?? null,
    logs: entry?.logs ?? [],
  });
}
