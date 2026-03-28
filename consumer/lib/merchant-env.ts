/**
 * Base URLs for agent dispatch when the UI "Merchant URL" field is empty.
 * Mirrors consumer chat MCP: same vars as lib/ai/mcp.ts so one .env.local works for both.
 */
export function merchantSeedsFromConsumerEnv(): { name: string; url: string }[] {
  const seen = new Set<string>();
  const out: { name: string; url: string }[] = [];

  const push = (raw: string, displayName: string) => {
    const u = raw.trim().replace(/\/+$/, "");
    if (!u || seen.has(u)) return;
    seen.add(u);
    out.push({ name: displayName.trim() || u, url: u });
  };

  const multi = process.env.MERCHANT_URLS?.trim();
  if (multi) {
    for (const part of multi.split(/[,\s]+/)) {
      const u = part.trim();
      if (u) push(u, u);
    }
  }

  const single =
    process.env.MCP_MERCHANT_URL?.trim() || process.env.MERCHANT_URL?.trim() || "";
  const defaultName = process.env.MCP_MERCHANT_NAME?.trim() || "Merchant";
  if (single) push(single, defaultName);

  return out;
}
