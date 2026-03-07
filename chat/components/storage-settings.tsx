"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/toast";
import { Card } from "@/components/ui/card";

type StorageBackend = "postgres" | "near";

export function StorageSettings() {
  const { data: session } = useSession();
  const [currentBackend, setCurrentBackend] = useState<StorageBackend>("postgres");
  const [isContractDeployed, setIsContractDeployed] = useState(false);
  const [isCheckingContract, setIsCheckingContract] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  const hasNearAccount = session?.user?.nearAccountId;

  useEffect(() => {
    if (hasNearAccount) {
      checkContractDeployment();
    }
  }, [hasNearAccount]);

  async function checkContractDeployment() {
    if (!hasNearAccount) return;

    setIsCheckingContract(true);
    try {
      // TODO: Implement contract check API
      // For now, assume not deployed
      setIsContractDeployed(false);
    } catch (error) {
      console.error("Failed to check contract:", error);
      setIsContractDeployed(false);
    } finally {
      setIsCheckingContract(false);
    }
  }

  async function switchBackend(newBackend: StorageBackend) {
    if (!session?.user) return;

    if (newBackend === "near" && !hasNearAccount) {
      toast({
        type: "error",
        description: "Please sign in with NEAR first to use NEAR storage.",
      });
      return;
    }

    if (newBackend === "near" && !isContractDeployed) {
      toast({
        type: "error",
        description: "NEAR contract not deployed. Deploy contract first (see NEAR_DEPLOYMENT_GUIDE.md)",
      });
      return;
    }

    setIsSwitching(true);
    try {
      // TODO: Implement backend switch API
      // For now, just update local state
      setCurrentBackend(newBackend);

      toast({
        type: "success",
        description: `Switched to ${newBackend === "near" ? "NEAR" : "PostgreSQL"} storage.`,
      });
    } catch (error) {
      console.error("Failed to switch backend:", error);
      toast({
        type: "error",
        description: "Failed to switch storage backend.",
      });
    } finally {
      setIsSwitching(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-lg">Storage Settings</h3>
        <p className="text-muted-foreground text-sm">
          Choose where your conversations are stored
        </p>
      </div>

      {/* Current Backend */}
      <Card className="p-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">Current Storage</Label>
          <div className="flex items-center gap-2">
            <div
              className={`h-3 w-3 rounded-full ${
                currentBackend === "near" ? "bg-green-500" : "bg-blue-500"
              }`}
            />
            <span className="font-medium">
              {currentBackend === "near" ? "NEAR Protocol" : "PostgreSQL"}
            </span>
          </div>
        </div>
      </Card>

      {/* NEAR Account Status */}
      {hasNearAccount && (
        <Card className="p-4">
          <div className="space-y-3">
            <div>
              <Label className="text-sm font-medium">NEAR Account</Label>
              <p className="text-sm text-muted-foreground mt-1">
                {session?.user?.nearAccountId}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div
                className={`h-3 w-3 rounded-full ${
                  isContractDeployed ? "bg-green-500" : "bg-yellow-500"
                }`}
              />
              <span className="text-sm">
                {isCheckingContract
                  ? "Checking contract..."
                  : isContractDeployed
                    ? "Contract deployed ✓"
                    : "Contract not deployed"}
              </span>
            </div>

            {!isContractDeployed && (
              <div className="rounded-md bg-yellow-50 p-3 text-sm dark:bg-yellow-900/20">
                <p className="text-yellow-800 dark:text-yellow-200">
                  <strong>Deploy required:</strong> Run deployment script to enable NEAR storage
                  <br />
                  <code className="text-xs">cd contracts/ai-memory && ./deploy.sh</code>
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Backend Selection */}
      <Card className="p-4">
        <div className="space-y-4">
          <Label className="text-sm font-medium">Choose Storage Backend</Label>

          <div className="grid gap-3">
            <Button
              variant={currentBackend === "postgres" ? "default" : "outline"}
              className="h-auto flex-col items-start p-4 text-left"
              onClick={() => switchBackend("postgres")}
              disabled={currentBackend === "postgres" || isSwitching}
            >
              <div className="flex w-full items-center gap-3">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.128 4.027a8.047 8.047 0 0 0-3.041-.595c-4.417 0-8 3.583-8 8s3.583 8 8 8a7.99 7.99 0 0 0 6.897-3.996 1 1 0 0 0-1.732-1.003 5.989 5.989 0 0 1-5.165 2.999c-3.309 0-6-2.691-6-6s2.691-6 6-6c.82 0 1.598.162 2.311.457a1 1 0 1 0 .73-1.862Z" />
                </svg>
                <div className="flex-1">
                  <p className="font-semibold">PostgreSQL</p>
                  <p className="text-muted-foreground text-xs">Traditional centralized database</p>
                </div>
              </div>
            </Button>

            <Button
              variant={currentBackend === "near" ? "default" : "outline"}
              className="h-auto flex-col items-start p-4 text-left"
              onClick={() => switchBackend("near")}
              disabled={
                currentBackend === "near" ||
                !hasNearAccount ||
                !isContractDeployed ||
                isSwitching
              }
            >
              <div className="flex w-full items-center gap-3">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14.8 2L18.6 8.7L19.2 9.7L19.4 9.3L19.5 2.1L22.3 2.3L22.1 21.8L19.3 22L12.5 12.3L11.9 11.3L11.7 11.7L11.6 18.9L8.8 18.7L9 1.8L11.9 2L14.8 2Z" />
                  <path d="M8.8 18.7L2 22L2.1 2.3L4.9 2.1L5 18.7L8.8 18.7Z" />
                </svg>
                <div className="flex-1">
                  <p className="font-semibold">NEAR Protocol</p>
                  <p className="text-muted-foreground text-xs">Decentralized, encrypted, user-owned</p>
                </div>
              </div>
            </Button>
          </div>

          {!hasNearAccount && (
            <p className="text-muted-foreground text-sm">
              → Sign in with NEAR to enable decentralized storage
            </p>
          )}
        </div>
      </Card>

      {/* Security Info */}
      <Card className="p-4">
        <div className="space-y-3">
          <Label className="text-sm font-medium">
            {currentBackend === "near" ? "Security Features" : "Why Use NEAR?"}
          </Label>

          {currentBackend === "near" ? (
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-sm">End-to-end AES-256-GCM encryption</p>
              </div>
              <div className="flex items-start gap-2">
                <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-sm">You own and control your data</p>
              </div>
              <div className="flex items-start gap-2">
                <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-sm">Decentralized - no single point of failure</p>
              </div>
              <div className="flex items-start gap-2">
                <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-sm">Keys never leave your browser</p>
              </div>
            </div>
          ) : (
            <div className="rounded-md bg-blue-50 p-3 text-sm dark:bg-blue-900/20">
              <p className="text-blue-800 dark:text-blue-200">
                Switch to NEAR for client-side encryption, data sovereignty, and decentralized storage on the blockchain.
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
