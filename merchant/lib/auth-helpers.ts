import type { Session } from "next-auth";
import { auth } from "@/app/(auth)/auth";

/** Signed-in user from Auth.js (no guarantee of id; check caller). */
export async function getSessionUser(): Promise<Session["user"] | null> {
  const session = await auth();
  return session?.user ?? null;
}
