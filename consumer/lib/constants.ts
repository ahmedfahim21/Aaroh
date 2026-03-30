import { generateDummyPassword } from "./db/utils";

/** Base Sepolia — matches Privy `defaultChain` and on-chain USDC usage in the consumer app */
export const BASE_SEPOLIA_CHAIN_ID = 84532;
/** Hex chain id for `wallet_switchEthereumChain` / `wallet_addEthereumChain` (84532) */
export const BASE_SEPOLIA_CHAIN_ID_HEX = "0x14a34" as const;
/** Native USDC on Base Sepolia (Circle). Used for agent funding, balances, checkout. */
export const USDC_BASE_SEPOLIA_ADDRESS =
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

/** Base Sepolia block explorer (matches `eip155:84532`). */
export const BASE_SEPOLIA_EXPLORER = "https://sepolia.basescan.org" as const;

// Found from: https://github.com/erc-8004/erc-8004-contracts

/** EIP-8004 IdentityRegistry on Base Sepolia (same network as `IDENTITY_REGISTRY_RPC` / agent.py). */
export const ERC8004_IDENTITY_REGISTRY_ADDRESS =
  "0x8004A818BFB912233c491871b3d84c89A494BD9e" as const;

/** EIP-8004 ReputationRegistry on Base Sepolia (feedback `giveFeedback`). */
export const REPUTATION_REGISTRY_ADDRESS =
  "0x8004B663056A597Dffe9eCcC1965A193B7388713" as const;

export const isProductionEnvironment = process.env.NODE_ENV === "production";
export const isDevelopmentEnvironment = process.env.NODE_ENV === "development";
export const isTestEnvironment = Boolean(
  process.env.PLAYWRIGHT_TEST_BASE_URL ||
    process.env.PLAYWRIGHT ||
    process.env.CI_PLAYWRIGHT
);

export const guestRegex = /^guest-\d+$/;

export const DUMMY_PASSWORD = generateDummyPassword();
