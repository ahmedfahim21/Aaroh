import "server-only";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Merchant } from "./schema";
import { merchant } from "./schema";

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

export async function createMerchant(data: {
  slug: string;
  name: string;
  walletAddress: string;
  categories?: string;
  tags?: string;
  description?: string;
}): Promise<Merchant> {
  const [row] = await db
    .insert(merchant)
    .values({
      ...data,
      categories: data.categories ?? "",
      tags: data.tags ?? "",
      description: data.description ?? "",
    })
    .returning();
  return row;
}

export async function listMerchants(): Promise<Merchant[]> {
  return db.select().from(merchant).orderBy(merchant.createdAt);
}

export async function getMerchantBySlug(
  slug: string
): Promise<Merchant | undefined> {
  const [row] = await db.select().from(merchant).where(eq(merchant.slug, slug));
  return row;
}
