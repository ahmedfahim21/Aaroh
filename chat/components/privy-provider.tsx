"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { sepolia } from "viem/chains";

const LOGIN_METHODS = [
  "wallet",
  "email",
  "google",
  "github",
  "discord",
] as const;

const WALLET_LIST = [
  "metamask",
  "coinbase_wallet",
  "rainbow",
  "detected_ethereum_wallets",
  "wallet_connect_qr",
] as const;

function PrivyProviderWithTheme({
  appId,
  children,
}: {
  appId: string;
  children: React.ReactNode;
}) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const privyTheme = mounted && resolvedTheme === "dark" ? "dark" : "light";

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: [...LOGIN_METHODS],
        // Match app on-chain usage (agents / USDC on Sepolia) so the account modal
        // shows native balance on Sepolia, not Ethereum mainnet.
        defaultChain: sepolia,
        supportedChains: [sepolia],
        appearance: {
          theme: privyTheme,
          accentColor: "#1e293b",
          walletList: [...WALLET_LIST],
          walletChainType: "ethereum-only",
        },
        embeddedWallets: {
          createOnLogin: "users-without-wallets",
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}

export function PrivyAppProvider({
  appId,
  children,
}: {
  appId: string;
  children: React.ReactNode;
}) {
  if (!appId) {
    return <>{children}</>;
  }
  return (
    <PrivyProviderWithTheme appId={appId}>{children}</PrivyProviderWithTheme>
  );
}
