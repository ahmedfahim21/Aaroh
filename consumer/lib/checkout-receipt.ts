/** Helpers for UCP checkout completion payloads (merchant JSON + our session enrichments). */

export const BASE_SEPOLIA_TX_EXPLORER = "https://sepolia.basescan.org/tx";

function isPlausibleTxHash(s: string): boolean {
  const t = s.trim();
  if (!t || t === "x402_settled") return false;
  const hex = t.startsWith("0x") ? t.slice(2) : t;
  return hex.length === 64 && /^[0-9a-fA-F]+$/.test(hex);
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v != null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** Unwrap Pydantic / SDK `root` wrapper if present. */
function unwrapRoot<T extends Record<string, unknown>>(obj: T): T {
  const inner = obj.root;
  if (inner != null && typeof inner === "object" && !Array.isArray(inner)) {
    return inner as T;
  }
  return obj;
}

/** Prefer canonical x402 fields (API merges tx_hash / PAYMENT-RESPONSE); legacy: EVM instrument token. */
export function extractTxHashFromCheckout(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const d = data as Record<string, unknown>;
  for (const key of ["tx_hash", "x402_transaction"] as const) {
    const v = d[key];
    if (typeof v === "string" && isPlausibleTxHash(v)) return v.trim();
  }
  const order = d.order;
  if (order && typeof order === "object") {
    const o = order as Record<string, unknown>;
    for (const key of ["tx_hash", "x402_transaction"] as const) {
      const v = o[key];
      if (typeof v === "string" && isPlausibleTxHash(v)) return v.trim();
    }
  }
  const paymentRaw = d.payment;
  let payment = asRecord(paymentRaw);
  if (payment) payment = unwrapRoot(payment);
  if (!payment) return undefined;
  const instruments = payment.instruments;
  if (!Array.isArray(instruments)) return undefined;
  for (const inst of instruments) {
    let node = asRecord(inst);
    if (node) node = unwrapRoot(node);
    if (!node) continue;
    let cred = asRecord(node.credential);
    if (cred) cred = unwrapRoot(cred);
    if (!cred) continue;
    const token = cred.token;
    if (typeof token === "string" && isPlausibleTxHash(token)) return token.trim();
  }
  return undefined;
}

export function txExplorerUrl(txHash: string | undefined | null): string | undefined {
  if (!txHash || !isPlausibleTxHash(txHash)) return undefined;
  return `${BASE_SEPOLIA_TX_EXPLORER}/${txHash.trim()}`;
}

export type LineItemLike = {
  item?: { title?: string; price?: number };
  quantity?: number;
};

export function lineItemsFromCheckout(data: unknown): Array<{
  title: string;
  quantity: number;
  priceCents: number;
  lineTotalCents: number;
}> {
  if (!data || typeof data !== "object") return [];
  const d = data as Record<string, unknown>;
  const raw = d.line_items ?? d.lineItems;
  if (!Array.isArray(raw)) return [];
  const out: Array<{
    title: string;
    quantity: number;
    priceCents: number;
    lineTotalCents: number;
  }> = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const li = row as LineItemLike;
    const qty = typeof li.quantity === "number" ? li.quantity : 1;
    const price = li.item?.price ?? 0;
    const title = li.item?.title ?? "Item";
    out.push({
      title,
      quantity: qty,
      priceCents: price,
      lineTotalCents: price * qty,
    });
  }
  return out;
}

export function totalCentsFromCheckout(data: unknown): number | undefined {
  if (!data || typeof data !== "object") return undefined;
  const d = data as Record<string, unknown>;
  const totals = d.totals;
  if (!Array.isArray(totals)) return undefined;
  const total = totals.find(
    (t): t is { type?: string; amount?: number } =>
      t != null && typeof t === "object" && (t as { type?: string }).type === "total"
  );
  return typeof total?.amount === "number" ? total.amount : undefined;
}

/** @deprecated Merchant /orders URLs are not shown in UI; kept for rare fallbacks. */
export function orderPermalinkFromCheckout(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const order = (data as Record<string, unknown>).order;
  if (!order || typeof order !== "object") return undefined;
  const o = order as Record<string, unknown>;
  const url = o.permalink_url ?? o.permalinkUrl;
  return typeof url === "string" ? url : undefined;
}

export function orderIdFromCheckout(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const order = (data as Record<string, unknown>).order;
  if (!order || typeof order !== "object") return undefined;
  const id = (order as Record<string, unknown>).id;
  return typeof id === "string" ? id : undefined;
}
