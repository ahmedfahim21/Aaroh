"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { signInWithWallet } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";

export function LandingPage() {
  const router = useRouter();
  const { ready, authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const [role, setRole] = useState<"consumer" | "merchant">("consumer");
  const [isPending, startTransition] = useTransition();

  // Auto-open Privy modal when page loads and user is not authenticated
  useEffect(() => {
    if (ready && !authenticated) {
      login();
    }
  }, [ready, authenticated, login]);

  // After wallet connect + role selection, sign in and redirect
  function handleContinue() {
    const address = wallets[0]?.address;
    if (!address) {
      login();
      return;
    }

    startTransition(async () => {
      await signInWithWallet(address, role);
      if (role === "merchant") {
        const merchantUrl =
          process.env.NEXT_PUBLIC_MERCHANT_APP_URL ?? "http://localhost:3001";
        window.location.href = merchantUrl;
      } else {
        router.push("/chat");
      }
    });
  }

  const isConnected = authenticated && wallets.length > 0;

  return (
    <div className="flex h-dvh w-screen">
      {/* Left panel — auth + role selection */}
      <div className="flex flex-col justify-center px-8 sm:px-16 w-full max-w-lg">
        <div className="mb-8">
          <span className="font-semibold text-2xl tracking-tight">Aaroh</span>
          <p className="text-muted-foreground text-sm mt-1">
            Agentic commerce for everyone
          </p>
        </div>

        {!isConnected ? (
          <div className="flex flex-col gap-4">
            <h2 className="text-xl font-medium">Get started</h2>
            <p className="text-sm text-muted-foreground">
              Connect your wallet or sign in with a social account to continue.
            </p>
            <button
              type="button"
              onClick={login}
              className="w-full rounded-lg bg-foreground text-background px-4 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Connect wallet / Sign in
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-xl font-medium">Welcome</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Connected:{" "}
                <span className="font-mono text-xs">
                  {wallets[0]?.address.slice(0, 6)}…
                  {wallets[0]?.address.slice(-4)}
                </span>
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">I am a:</p>
              <div className="flex gap-2">
                <RoleButton
                  active={role === "consumer"}
                  onClick={() => setRole("consumer")}
                >
                  Shopper
                </RoleButton>
                <RoleButton
                  active={role === "merchant"}
                  onClick={() => setRole("merchant")}
                >
                  Seller
                </RoleButton>
              </div>
            </div>

            <button
              type="button"
              onClick={handleContinue}
              disabled={isPending}
              className="w-full rounded-lg bg-foreground text-background px-4 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isPending ? "Signing in…" : "Continue →"}
            </button>
          </div>
        )}
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
                d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
              />
            </svg>
          </div>
          <p className="text-sm font-medium opacity-40">Agentic commerce</p>
        </div>
      </div>
    </div>
  );
}

function RoleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-foreground hover:bg-muted"
      )}
    >
      {children}
    </button>
  );
}
