"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import type { CartViewData } from "@/components/commerce/cart-view";

const CONTRACT_ID =
  process.env.NEXT_PUBLIC_NEAR_CONTRACT_ID || "aaroh-commerce.testnet";

/**
 * Syncs cart data to NEAR blockchain whenever it changes.
 * Uses the wallet selector's stored function-call access key (granted at sign-in),
 * so no redirect/popup is shown to the user.
 */
export function useNearCartSync(
  cart: CartViewData | null,
  merchantUrl: string = ""
) {
  const { data: session } = useSession();
  const nearAccountId = session?.user?.nearAccountId;
  const lastSyncedRef = useRef<string>("");

  useEffect(() => {
    if (!nearAccountId || !cart) return;

    // Serialize cart to detect actual changes
    const cartKey = JSON.stringify(cart.items);
    if (cartKey === lastSyncedRef.current) return;
    lastSyncedRef.current = cartKey;

    syncCartToNear(nearAccountId, cart, merchantUrl).catch((err) => {
      console.error("[NEAR cart sync] Failed:", err);
    });
  }, [nearAccountId, cart, merchantUrl]);
}

async function syncCartToNear(
  accountId: string,
  cart: CartViewData,
  merchantUrl: string
) {
  // Use near-api-js directly with BrowserLocalStorageKeyStore.
  // my-near-wallet stores function-call access keys in localStorage using the
  // near-api-js keystore format, so this picks them up without needing the
  // wallet selector (which has a BORSH enum serialization issue).
  const nearAPI = await import("near-api-js");
  const { connect, keyStores } = nearAPI;

  const network = process.env.NEXT_PUBLIC_NEAR_NETWORK || "testnet";
  const nodeUrl =
    network === "mainnet"
      ? "https://rpc.mainnet.near.org"
      : "https://rpc.testnet.near.org";

  const keyStore = new keyStores.BrowserLocalStorageKeyStore();

  // Check a key exists before attempting the call
  const key = await keyStore.getKey(network, accountId);
  if (!key) {
    console.warn(
      "[NEAR cart sync] No key found in localStorage for",
      accountId,
      "— sign out and sign in again to grant a function-call access key"
    );
    return;
  }

  const near = await connect({
    networkId: network,
    keyStore,
    nodeUrl,
    headers: {},
  });

  const account = await near.account(accountId);

  const cartPayload = {
    items: cart.items.map((item) => ({
      product_id: item.product_id,
      quantity: item.quantity,
      merchant_name: "",
      title: item.title,
      price: item.price_cents,
    })),
    merchant_url: merchantUrl,
    updated_at: Date.now() * 1_000_000, // nanoseconds
  };

  console.log("[NEAR cart sync] Calling save_cart via near-api-js:", cartPayload);

  await account.functionCall({
    contractId: CONTRACT_ID,
    methodName: "save_cart",
    args: { cart: cartPayload },
    gas: BigInt("30000000000000"),
  });

  console.log("[NEAR cart sync] Cart synced successfully");
}
