import "server-only";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ChatSDKError } from "../errors";
import { type User, user } from "./schema";

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

export async function getUser(email: string): Promise<User[]> {
  try {
    return await db.select().from(user).where(eq(user.email, email));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get user by email"
    );
  }
}

export async function getOrCreateUserByWallet(
  walletAddress: string,
  role: "consumer" | "merchant" = "merchant"
): Promise<User> {
  const lowerAddress = walletAddress.toLowerCase();
  try {
    const existing = await db
      .select()
      .from(user)
      .where(eq(user.walletAddress, lowerAddress))
      .limit(1);
    if (existing.length > 0) return existing[0];

    const [created] = await db
      .insert(user)
      .values({
        email: `wallet-${lowerAddress}`,
        walletAddress: lowerAddress,
        role,
      })
      .returning();
    return created;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get or create user by wallet"
    );
  }
}
