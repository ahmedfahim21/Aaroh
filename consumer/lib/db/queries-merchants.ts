import "server-only";

import { and, eq } from "drizzle-orm";
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
  ownerId: string;
  categories?: string;
  tags?: string;
  description?: string;
}): Promise<Merchant> {
  const [row] = await db
    .insert(merchant)
    .values({
      ...data,
      walletAddress: data.walletAddress.toLowerCase(),
      categories: data.categories ?? "",
      tags: data.tags ?? "",
      description: data.description ?? "",
    })
    .returning();
  return row;
}

export async function upsertMerchantForOwner(data: {
  slug: string;
  name: string;
  walletAddress: string;
  ownerId: string;
  categories?: string;
  tags?: string;
  description?: string;
}): Promise<Merchant> {
  const existing = await getMerchantBySlug(data.slug);
  if (existing && existing.ownerId !== data.ownerId) {
    throw new Error("SLUG_TAKEN");
  }

  if (existing?.ownerId === data.ownerId) {
    const [row] = await db
      .update(merchant)
      .set({
        name: data.name,
        walletAddress: data.walletAddress.toLowerCase(),
        categories: data.categories ?? "",
        tags: data.tags ?? "",
        description: data.description ?? "",
      })
      .where(
        and(eq(merchant.slug, data.slug), eq(merchant.ownerId, data.ownerId))
      )
      .returning();
    return row;
  }

  return createMerchant({
    ...data,
    walletAddress: data.walletAddress.toLowerCase(),
  });
}

export function listMerchantsByOwner(ownerId: string): Promise<Merchant[]> {
  return db
    .select()
    .from(merchant)
    .where(eq(merchant.ownerId, ownerId))
    .orderBy(merchant.createdAt);
}

export async function getMerchantBySlug(
  slug: string
): Promise<Merchant | undefined> {
  const [row] = await db.select().from(merchant).where(eq(merchant.slug, slug));
  return row;
}

export async function getMerchantBySlugForOwner(
  slug: string,
  ownerId: string
): Promise<Merchant | undefined> {
  const [row] = await db
    .select()
    .from(merchant)
    .where(and(eq(merchant.slug, slug), eq(merchant.ownerId, ownerId)));
  return row;
}
