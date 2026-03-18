"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/", label: "Chat", match: (p: string) => p === "/" || p.startsWith("/chat") },
  { href: "/agents", label: "Agents", match: (p: string) => p.startsWith("/agents") },
  { href: "/merchants", label: "Merchants", match: (p: string) => p.startsWith("/merchants") },
];

export function TopNav() {
  const pathname = usePathname();
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();

  const primaryWallet = wallets[0];
  const shortAddr = primaryWallet
    ? `${primaryWallet.address.slice(0, 6)}…${primaryWallet.address.slice(-4)}`
    : null;

  return (
    <header className="h-12 border-b bg-background flex items-center px-4 shrink-0 z-20 sticky top-0">
      <Link href="/" className="font-semibold text-base tracking-tight mr-6">
        Aaroh
      </Link>

      <nav className="flex items-center gap-1">
        {NAV_LINKS.map(({ href, label, match }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-muted",
              match(pathname)
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground"
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Wallet section */}
      {ready && (
        <div className="flex items-center gap-2">
          {authenticated && shortAddr ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                <span className="font-mono">{shortAddr}</span>
              </div>
              <button
                type="button"
                onClick={logout}
                className="rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={login}
              className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
            >
              Connect Wallet
            </button>
          )}
        </div>
      )}
    </header>
  );
}
