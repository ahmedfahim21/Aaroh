"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { useTheme } from "next-themes";
import {
  arbitrum,
  base,
  baseSepolia,
  mainnet,
  optimism,
  polygon,
} from "viem/chains";

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

const SUPPORTED_EVM_CHAINS = [
  baseSepolia,
  mainnet,
  base,
  optimism,
  arbitrum,
  polygon,
] as const;

function PrivyProviderWithTheme({
  appId,
  children,
}: {
  appId: string;
  children: React.ReactNode;
}) {
  const { resolvedTheme } = useTheme();

  const privyTheme = resolvedTheme === "dark" ? "dark" : "light";

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: [...LOGIN_METHODS],
        // Match app on-chain usage (agents / USDC on Base Sepolia) so the account modal
        // defaults to Base Sepolia while still allowing users to view/switch other networks.
        defaultChain: baseSepolia,
        supportedChains: [...SUPPORTED_EVM_CHAINS],
        appearance: {
          theme: privyTheme,
          accentColor: "#1e293b",
          walletList: [...WALLET_LIST],
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
