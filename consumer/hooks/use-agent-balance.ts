"use client";

import { useCallback, useEffect, useState } from "react";
import { createPublicClient, http, erc20Abi } from "viem";
import { baseSepolia } from "viem/chains";

const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCf7e" as const;

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

export function useAgentBalance(agentAddress: `0x${string}` | null | undefined) {
  const [balance, setBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!agentAddress) return;
    setLoading(true);
    try {
      const raw = await publicClient.readContract({
        address: USDC,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [agentAddress],
      });
      setBalance((Number(raw) / 1_000_000).toFixed(2));
    } catch {
      setBalance(null);
    } finally {
      setLoading(false);
    }
  }, [agentAddress]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { balance, loading, refetch };
}
