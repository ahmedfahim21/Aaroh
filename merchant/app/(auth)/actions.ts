"use server";

import { signIn } from "./auth";

export type SignInWithWalletState = {
  status: "idle" | "in_progress" | "success" | "failed";
};

export async function signInWithWallet(
  walletAddress: string,
  role: "consumer" | "merchant" = "merchant"
): Promise<SignInWithWalletState> {
  try {
    await signIn("wallet", { walletAddress, role, redirect: false });
    return { status: "success" };
  } catch (_error) {
    return { status: "failed" };
  }
}
