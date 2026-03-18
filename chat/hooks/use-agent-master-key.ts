"use client";

import { keccak256, hexToBytes, concat } from "viem";
import { privateKeyToAddress } from "viem/accounts";

const STORAGE_KEY = "aaroh:agent-master-sig";

export async function getMasterSignature(
  signMessage: (opts: { message: string }) => Promise<string>
): Promise<`0x${string}`> {
  if (typeof window !== "undefined") {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) return cached as `0x${string}`;
  }
  const sig = await signMessage({ message: "Aaroh Agent Master Key v1" });
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, sig);
  }
  return sig as `0x${string}`;
}

export function clearMasterSignature() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function getCachedSignature(): `0x${string}` | null {
  if (typeof window === "undefined") return null;
  return (localStorage.getItem(STORAGE_KEY) as `0x${string}`) ?? null;
}

export function deriveAgentKey(sig: `0x${string}`, agentId: string): `0x${string}` {
  const sigBytes = hexToBytes(sig);
  const cleanId = agentId.replace(/-/g, "");
  const uuidBytes = hexToBytes(`0x${cleanId}`);
  return keccak256(concat([sigBytes, uuidBytes]));
}

export function deriveAgentAddress(sig: `0x${string}`, agentId: string): `0x${string}` {
  return privateKeyToAddress(deriveAgentKey(sig, agentId));
}
