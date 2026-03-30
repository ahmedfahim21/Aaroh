"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPublicClient, formatEther, http, erc20Abi } from "viem";
import { baseSepolia } from "viem/chains";
import { USDC_BASE_SEPOLIA_ADDRESS } from "@/lib/constants";

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

export function useAgentBalance(
  agentAddress: `0x${string}` | null | undefined,
  options?: { refetchIntervalMs?: number },
) {
  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);
  const [ethBalance, setEthBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refetchIntervalMs = useMemo(
    () => options?.refetchIntervalMs ?? 15_000,
    [options?.refetchIntervalMs],
  );

  const fetchBalances = useCallback(
    async (address: `0x${string}`) => {
      let usdc: string | null = null;
      let eth: string | null = null;

      try {
        const rawUsdc = await publicClient.readContract({
          address: USDC_BASE_SEPOLIA_ADDRESS,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        });

        usdc = (Number(rawUsdc) / 1_000_000).toFixed(2);
      } catch {
        // USDC balance is optional for display; don't wipe ETH if this call fails.
      }

      try {
        const rawEth = await publicClient.getBalance({ address });
        const ethFormatted = formatEther(rawEth);
        eth = Number(ethFormatted) < 0.000001 ? "0" : Number(ethFormatted).toFixed(6);
      } catch {
        // Same idea: don't wipe USDC if ETH call fails.
      }

      return { usdc, eth };
    },
    [],
  );

  const refetch = useCallback(async () => {
    if (!agentAddress) return;
    setLoading(true);
    try {
      const { usdc, eth } = await fetchBalances(agentAddress);
      setUsdcBalance(usdc);
      setEthBalance(eth);
    } finally {
      setLoading(false);
    }
  }, [agentAddress, fetchBalances]);

  const usdcBalanceRef = useRef(usdcBalance);
  const ethBalanceRef = useRef(ethBalance);
  useEffect(() => {
    usdcBalanceRef.current = usdcBalance;
  }, [usdcBalance]);
  useEffect(() => {
    ethBalanceRef.current = ethBalance;
  }, [ethBalance]);

  const pollStateRef = useRef<{
    intervalId: ReturnType<typeof setInterval> | null;
    running: boolean;
  }>({ intervalId: null, running: false });

  const refetchUntilChanged = useCallback(
    async (opts?: { pollIntervalMs?: number; timeoutMs?: number }) => {
      if (!agentAddress) return;

      const pollIntervalMs = opts?.pollIntervalMs ?? 4_000;
      const timeoutMs = opts?.timeoutMs ?? 30_000;

      // Avoid overlapping polls when the user clicks "Fund agent" multiple times.
      if (pollStateRef.current.intervalId) {
        clearInterval(pollStateRef.current.intervalId);
        pollStateRef.current.intervalId = null;
      }

      pollStateRef.current.running = true;

      const startUsdc = usdcBalanceRef.current;
      const startEth = ethBalanceRef.current;

      const stop = () => {
        if (pollStateRef.current.intervalId) {
          clearInterval(pollStateRef.current.intervalId);
          pollStateRef.current.intervalId = null;
        }
        pollStateRef.current.running = false;
      };

      try {
        // First attempt: often the funding tx will have confirmed by then.
        setLoading(true);
        try {
          const { usdc, eth } = await fetchBalances(agentAddress);
          if (usdc !== startUsdc || eth !== startEth) {
            setUsdcBalance(usdc);
            setEthBalance(eth);
            return stop();
          }
        } finally {
          setLoading(false);
        }

        const startedAt = Date.now();
        const intervalId = setInterval(async () => {
          if (!pollStateRef.current.running) return;
          if (Date.now() - startedAt >= timeoutMs) return stop();

          setLoading(true);
          try {
            const { usdc, eth } = await fetchBalances(agentAddress);
            if (usdc !== usdcBalanceRef.current || eth !== ethBalanceRef.current) {
              setUsdcBalance(usdc);
              setEthBalance(eth);
              stop();
            }
          } catch {
            // Ignore errors during polling; keep trying until timeout.
          } finally {
            setLoading(false);
          }
        }, pollIntervalMs);

        pollStateRef.current.intervalId = intervalId;
      } catch {
        pollStateRef.current.running = false;
        stop();
      }
    },
    [agentAddress, fetchBalances],
  );

  useEffect(() => {
    if (!agentAddress) return;

    const intervalId = setInterval(() => {
      void refetch();
    }, refetchIntervalMs);

    return () => clearInterval(intervalId);
  }, [agentAddress, refetch, refetchIntervalMs]);

  // Ensure polling intervals from `refetchUntilChanged()` never leak after unmount.
  useEffect(() => {
    return () => {
      if (pollStateRef.current.intervalId) {
        clearInterval(pollStateRef.current.intervalId);
        pollStateRef.current.intervalId = null;
      }
      pollStateRef.current.running = false;
    };
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  /** @deprecated use usdcBalance */
  const balance = usdcBalance;

  return { balance, usdcBalance, ethBalance, loading, refetch, refetchUntilChanged };
}
