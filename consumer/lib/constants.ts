import { generateDummyPassword } from "./db/utils";

/** Base Sepolia — matches Privy `defaultChain` and on-chain USDC usage in the consumer app */
export const BASE_SEPOLIA_CHAIN_ID = 84532;
/** Hex chain id for `wallet_switchEthereumChain` / `wallet_addEthereumChain` (84532) */
export const BASE_SEPOLIA_CHAIN_ID_HEX = "0x14a34" as const;
/** Native USDC on Base Sepolia (Circle). Used for agent funding, balances, checkout. */
export const USDC_BASE_SEPOLIA_ADDRESS =
  "0x036CbD53842c5426634e7929541eC2318f3dCf7e" as const;

export const isProductionEnvironment = process.env.NODE_ENV === "production";
export const isDevelopmentEnvironment = process.env.NODE_ENV === "development";
export const isTestEnvironment = Boolean(
  process.env.PLAYWRIGHT_TEST_BASE_URL ||
    process.env.PLAYWRIGHT ||
    process.env.CI_PLAYWRIGHT
);

export const guestRegex = /^guest-\d+$/;

export const DUMMY_PASSWORD = generateDummyPassword();
