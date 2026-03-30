"use client";

import { useWallets } from "@privy-io/react-auth";
import { encodeFunctionData, getAddress, isAddress } from "viem";
import {
  BASE_SEPOLIA_CHAIN_ID_HEX,
  REPUTATION_REGISTRY_ADDRESS,
} from "@/lib/constants";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

async function getActiveChainIdHex(provider: EthereumProvider): Promise<string | null> {
  try {
    const res = await provider.request({ method: "eth_chainId" });
    return typeof res === "string" ? res : null;
  } catch {
    return null;
  }
}

/** Minimal ABI for ReputationRegistry.giveFeedback (EIP-8004). */
const REPUTATION_GIVE_FEEDBACK_ABI = [
  {
    name: "giveFeedback",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "value", type: "int128" },
      { name: "valueDecimals", type: "uint8" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
      { name: "endpoint", type: "string" },
      { name: "feedbackURI", type: "string" },
      { name: "feedbackHash", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

const ZERO_HASH =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

/**
 * Submit on-chain reputation for an agent (consumer wallet pays gas).
 * Uses tag1 "starred" with value 0–100 per EIP-8004 examples.
 */
export function useReputationFeedback() {
  const { wallets } = useWallets();

  const submitFeedback = async (
    onChainAgentId: number,
    liked: boolean,
  ): Promise<{ ok: boolean; error?: string }> => {
    const wallet = wallets.find((w) => isAddress(w.address));
    if (!wallet) {
      return { ok: false, error: "Connect a wallet first." };
    }
    try {
      const provider = (await wallet.getEthereumProvider()) as EthereumProvider;
      const before = await getActiveChainIdHex(provider);
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: BASE_SEPOLIA_CHAIN_ID_HEX }],
        });
      } catch (e) {
        const after = await getActiveChainIdHex(provider);
        if (after !== BASE_SEPOLIA_CHAIN_ID_HEX) {
          return {
            ok: false,
            error:
              before && after && before !== after
                ? `Network switch failed (still on ${after}).`
                : "Network switch failed.",
          };
        }
      }
      const active = await getActiveChainIdHex(provider);
      if (active !== BASE_SEPOLIA_CHAIN_ID_HEX) {
        return { ok: false, error: "Wrong network selected." };
      }

      const value = liked ? 100n : 0n;
      const data = encodeFunctionData({
        abi: REPUTATION_GIVE_FEEDBACK_ABI,
        functionName: "giveFeedback",
        args: [
          BigInt(onChainAgentId),
          value,
          0,
          "starred",
          "session",
          "",
          "",
          ZERO_HASH,
        ],
      });

      await provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: getAddress(wallet.address),
            to: REPUTATION_REGISTRY_ADDRESS,
            data,
          },
        ],
      });
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Reputation tx failed",
      };
    }
  };

  return { submitFeedback };
}
