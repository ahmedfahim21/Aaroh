"use client";

import { useCallback, useEffect, useState } from "react";
import { createPublicClient, http, isHash } from "viem";
import { baseSepolia } from "viem/chains";

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

export function useTxVerification(txHash: string | null | undefined) {
  const [verified, setVerified] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  const check = useCallback(async () => {
    if (!txHash || !isHash(txHash)) {
      setVerified(null);
      return;
    }
    setLoading(true);
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
      setVerified(receipt.status === "success");
    } catch {
      setVerified(false);
    } finally {
      setLoading(false);
    }
  }, [txHash]);

  useEffect(() => {
    check();
  }, [check]);

  return { verified, loading, recheck: check };
}
