"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "./ui/button";
import { signInWithNear } from "@/lib/near/auth";
import { toast } from "./toast";

export function NearSignInButton() {
  const [isLoading, setIsLoading] = useState(false);

  const handleNearSignIn = async () => {
    try {
      setIsLoading(true);

      // Open NEAR wallet selector modal and wait for account connection
      const accountId = await signInWithNear();

      if (!accountId) {
        toast({
          type: "error",
          description: "Failed to connect NEAR wallet. Please try again.",
        });
        return;
      }

      // Authenticate with NextAuth using NEAR provider
      const result = await signIn("near", {
        nearAccountId: accountId,
        redirect: false,
      });

      if (result?.error) {
        toast({
          type: "error",
          description: "Failed to authenticate with NEAR account.",
        });
        return;
      }

      // Success - NextAuth will handle redirect
      toast({
        type: "success",
        description: `Signed in with NEAR account: ${accountId}`,
      });

      window.location.reload();
    } catch (error) {
      console.error("NEAR sign-in error:", error);
      toast({
        type: "error",
        description: "An unexpected error occurred. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      disabled={isLoading}
      onClick={handleNearSignIn}
      className="w-full"
    >
      <svg
        className="mr-2 h-5 w-5"
        viewBox="0 0 24 24"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M14.8 2L18.6 8.7L19.2 9.7L19.4 9.3L19.5 2.1L22.3 2.3L22.1 21.8L19.3 22L12.5 12.3L11.9 11.3L11.7 11.7L11.6 18.9L8.8 18.7L9 1.8L11.9 2L14.8 2Z" />
        <path d="M8.8 18.7L2 22L2.1 2.3L4.9 2.1L5 18.7L8.8 18.7Z" />
      </svg>
      {isLoading ? "Connecting..." : "Sign in with NEAR"}
    </Button>
  );
}
