"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileDropZone } from "./file-drop-zone";
import { WalletConnectSection } from "./wallet-connect-section";

type Status = "idle" | "loading" | "error";

type Props = {
  privyEnabled: boolean;
};

export function OnboardForm({ privyEnabled }: Props) {
  const router = useRouter();
  const [merchantName, setMerchantName] = useState("");
  const [merchantWallet, setMerchantWallet] = useState("");
  const [walletFromPrivy, setWalletFromPrivy] = useState(false);
  const [tags, setTags] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  const handleWalletAddress = useCallback((address: string) => {
    setMerchantWallet(address);
    setWalletFromPrivy(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!merchantName.trim() || !merchantWallet.trim() || !file) {
      setStatus("error");
      setMessage("Please fill in all fields and upload a catalogue file.");
      return;
    }

    setStatus("loading");
    setMessage("");

    const formData = new FormData();
    formData.set("merchant_name", merchantName.trim());
    formData.set("merchant_wallet", merchantWallet.trim());
    formData.set("catalogue", file);

    try {
      const res = await fetch("/api/onboard", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setMessage(data.detail ?? res.statusText ?? "Onboarding failed.");
        return;
      }
      // Register merchant in DB for discovery by agents
      const slug: string =
        data.slug ??
        data.merchant_name?.toLowerCase().replace(/\s+/g, "-") ??
        "unknown";
      const registerRes = await fetch("/api/merchants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug,
          name: data.merchant_name ?? merchantName.trim(),
          walletAddress: merchantWallet.trim(),
          categories: data.categories ?? "",
          tags: tags.trim(),
          description: description.trim(),
        }),
      });

      if (!registerRes.ok) {
        const errorData = await registerRes.json().catch(() => ({}));
        setStatus("error");
        setMessage(
          errorData.error ?? "Failed to register merchant in the database."
        );
        return;
      }

      setMerchantName("");
      setMerchantWallet("");
      setWalletFromPrivy(false);
      setTags("");
      setDescription("");
      setFile(null);
      setStatus("idle");
      setMessage("");
      router.replace("/dashboard");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Network error.");
    }
  };

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
      {privyEnabled && (
        <WalletConnectSection onAddressChange={handleWalletAddress} />
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="merchant_name">Merchant name</Label>
        <Input
          id="merchant_name"
          onChange={(e) => setMerchantName(e.target.value)}
          placeholder="e.g. Green Craft Co."
          required
          type="text"
          value={merchantName}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="merchant_wallet">EVM wallet address</Label>
        <div className="relative">
          <Input
            className={
              walletFromPrivy
                ? "border-green-400 pr-28 dark:border-green-600"
                : "pr-28"
            }
            id="merchant_wallet"
            onChange={(e) => {
              setMerchantWallet(e.target.value);
              setWalletFromPrivy(false);
            }}
            placeholder="0x1234…abcd"
            required
            type="text"
            value={merchantWallet}
          />
          {walletFromPrivy && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-green-600 dark:text-green-400">
              ✓ from wallet
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="merchant_tags">Tags</Label>
        <Input
          id="merchant_tags"
          onChange={(e) => setTags(e.target.value)}
          placeholder="e.g. organic, handmade, local (comma-separated)"
          type="text"
          value={tags}
        />
        <p className="text-xs text-muted-foreground">
          Optional. Helps agents discover this merchant.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="merchant_description">Description</Label>
        <Textarea
          className="resize-y min-h-[72px]"
          id="merchant_description"
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Short description of your store or catalogue…"
          rows={3}
          value={description}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label>Catalogue file</Label>
          <a
            className="text-xs text-muted-foreground underline hover:text-foreground"
            download="example-catalogue.csv"
            href="/example-catalogue.csv"
          >
            Download example CSV
          </a>
        </div>
        <FileDropZone
          disabled={status === "loading"}
          onChange={setFile}
          value={file}
        />
      </div>

      {status === "error" && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {message}
        </div>
      )}

      <Button className="w-full" disabled={status === "loading"} type="submit">
        {status === "loading" ? "Processing…" : "Onboard merchant"}
      </Button>
    </form>
  );
}
