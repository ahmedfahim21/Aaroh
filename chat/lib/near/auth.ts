import { setupWalletSelector, type WalletSelector } from "@near-wallet-selector/core";
import { setupModal, type WalletSelectorModal } from "@near-wallet-selector/modal-ui";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import type { AccountView } from "near-api-js/lib/providers/provider";

// NEAR network configuration
const NEAR_NETWORK = process.env.NEXT_PUBLIC_NEAR_NETWORK || "testnet";
const NEAR_NODE_URL =
  NEAR_NETWORK === "mainnet"
    ? "https://rpc.mainnet.near.org"
    : "https://rpc.testnet.near.org";

// Wallet selector instance (client-side only)
let walletSelector: WalletSelector | null = null;
let modal: WalletSelectorModal | null = null;

/**
 * Initialize NEAR wallet selector
 * Must be called from client-side only (browser)
 */
export async function initNearWallet(): Promise<{
  selector: WalletSelector;
  modal: WalletSelectorModal;
}> {
  if (typeof window === "undefined") {
    throw new Error("NEAR wallet can only be initialized in the browser");
  }

  // Return existing instance if already initialized
  if (walletSelector && modal) {
    return { selector: walletSelector, modal };
  }

  // Initialize wallet selector
  walletSelector = await setupWalletSelector({
    network: NEAR_NETWORK,
    modules: [
      setupMyNearWallet(),
    ],
  });

  // Setup modal for wallet selection UI
  modal = setupModal(walletSelector, {
    contractId: "", // No contract needed for authentication
    description: "Sign in with your NEAR account to access secure AI memory",
  });

  return { selector: walletSelector, modal };
}

/**
 * Get currently connected NEAR account
 */
export async function getConnectedAccount(): Promise<string | null> {
  if (!walletSelector) {
    return null;
  }

  const wallet = await walletSelector.wallet();
  const accounts = await wallet.getAccounts();

  return accounts.length > 0 ? accounts[0].accountId : null;
}

/**
 * Sign in with NEAR wallet
 * Opens wallet selector modal
 */
export async function signInWithNear(): Promise<string | null> {
  const { modal } = await initNearWallet();

  return new Promise((resolve) => {
    modal.show();

    // Listen for account connection
    const checkConnection = setInterval(async () => {
      const accountId = await getConnectedAccount();
      if (accountId) {
        clearInterval(checkConnection);
        modal.hide();
        resolve(accountId);
      }
    }, 500);

    // Timeout after 5 minutes
    setTimeout(() => {
      clearInterval(checkConnection);
      resolve(null);
    }, 300000);
  });
}

/**
 * Sign out from NEAR wallet
 */
export async function signOutNear(): Promise<void> {
  if (!walletSelector) {
    return;
  }

  const wallet = await walletSelector.wallet();
  await wallet.signOut();
}

/**
 * Verify NEAR account exists and get account details
 * This is a server-side function
 */
export async function verifyNearAccount(
  accountId: string
): Promise<AccountView | null> {
  try {
    const response = await fetch(NEAR_NODE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "verify-account",
        method: "query",
        params: {
          request_type: "view_account",
          finality: "final",
          account_id: accountId,
        },
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error("NEAR account verification error:", data.error);
      return null;
    }

    return data.result as AccountView;
  } catch (error) {
    console.error("Failed to verify NEAR account:", error);
    return null;
  }
}

/**
 * Create a signature verification message
 * Used for proving account ownership
 */
export function createVerificationMessage(accountId: string): string {
  const timestamp = Date.now();
  return `Sign this message to verify your NEAR account ownership\n\nAccount: ${accountId}\nTimestamp: ${timestamp}\n\nThis signature will be used for authentication purposes only.`;
}

/**
 * Request account signature for verification
 */
export async function requestAccountSignature(
  accountId: string,
  message: string
): Promise<{ signature: string; publicKey: string } | null> {
  if (!walletSelector) {
    return null;
  }

  try {
    const wallet = await walletSelector.wallet();
    const signedMessage = await wallet.signMessage({
      message,
      recipient: accountId,
      nonce: Buffer.from(Date.now().toString()),
    });

    if (!signedMessage) {
      return null;
    }

    return {
      signature: Buffer.from(signedMessage.signature).toString("base64"),
      publicKey: signedMessage.publicKey.toString(),
    };
  } catch (error) {
    console.error("Failed to sign message:", error);
    return null;
  }
}

/**
 * Get wallet selector instance
 */
export function getWalletSelector(): WalletSelector | null {
  return walletSelector;
}

/**
 * Check if wallet is initialized
 */
export function isWalletInitialized(): boolean {
  return walletSelector !== null && modal !== null;
}
