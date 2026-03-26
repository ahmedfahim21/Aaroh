"use client";

import { UserPill } from "@privy-io/react-auth/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  {
    href: "/chat",
    label: "Chat",
    match: (p: string) => p.startsWith("/chat"),
  },
  {
    href: "/agents",
    label: "Agents",
    match: (p: string) => p.startsWith("/agents"),
  },
];

export function TopNav() {
  const pathname = usePathname();
  const hasPrivy = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);

  return (
    <header className="h-12 border-b bg-background flex items-center px-4 shrink-0 z-20 sticky top-0">
      <Link className="font-semibold text-base tracking-tight mr-6" href="/">
        Aaroh
      </Link>

      <nav className="flex items-center gap-1">
        {NAV_LINKS.map(({ href, label, match }) => (
          <Link
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-muted",
              match(pathname)
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground"
            )}
            href={href}
            key={href}
          >
            {label}
          </Link>
        ))}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Wallet / login — Privy UserPill when app is configured */}
      {hasPrivy && (
        <div className="nav-user-pill flex items-center gap-2">
          <UserPill
            action={{ type: "login" }}
            expanded
            ui={{ background: "secondary" }}
          />
        </div>
      )}
    </header>
  );
}
