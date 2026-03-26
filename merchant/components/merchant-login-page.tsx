"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { signInWithWallet } from "@/app/(auth)/actions";

export function MerchantLoginPage() {
  const router = useRouter();
  const { ready, authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const [isPending, startTransition] = useTransition();

  // Auto-open Privy modal when page loads and user is not authenticated
  useEffect(() => {
    if (ready && !authenticated) {
      login();
    }
  }, [ready, authenticated, login]);

  // After wallet connects, sign in as merchant and redirect to dashboard
  useEffect(() => {
    if (authenticated && wallets.length > 0) {
      const address = wallets[0].address;
      startTransition(async () => {
        await signInWithWallet(address, "merchant");
        router.push("/dashboard");
      });
    }
  }, [authenticated, wallets, router]);

  const isConnecting = authenticated && (wallets.length === 0 || isPending);

  return (
    <div className="flex h-dvh w-screen">
      {/* Left panel */}
      <div className="flex flex-col justify-center px-8 sm:px-16 w-full max-w-lg">
        <div className="mb-8">
          <span className="font-semibold text-2xl tracking-tight">Aaroh</span>
          <p className="text-muted-foreground text-sm mt-1">Merchant portal</p>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-medium">Sign in as a seller</h2>
          <p className="text-sm text-muted-foreground">
            Connect your wallet to access your merchant dashboard.
          </p>

          {isConnecting ? (
            <p className="text-sm text-muted-foreground">Signing in…</p>
          ) : (
            <button
              type="button"
              onClick={login}
              className="w-full rounded-lg bg-foreground text-background px-4 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Connect wallet / Sign in
            </button>
          )}

          <p className="text-xs text-muted-foreground">
            Looking to shop?{" "}
            <a
              href={process.env.NEXT_PUBLIC_CONSUMER_APP_URL ?? "http://localhost:3000"}
              className="underline"
            >
              Go to consumer app
            </a>
          </p>
        </div>
      </div>

      {/* Right panel — hero placeholder */}
      <div className="hidden md:flex flex-1 bg-muted items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-muted-foreground select-none">
          <div className="w-24 h-24 rounded-2xl bg-muted-foreground/10 flex items-center justify-center">
            <svg
              className="w-10 h-10 opacity-30"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z"
              />
            </svg>
          </div>
          <p className="text-sm font-medium opacity-40">Merchant portal</p>
        </div>
      </div>
    </div>
  );
}
