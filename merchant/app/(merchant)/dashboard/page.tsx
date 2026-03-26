import Link from "next/link";
import { MerchantList } from "@/components/merchant/merchant-list";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Dashboard – Aaroh Merchant" };

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto w-full">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Onboarded merchants. Start a UCP server for each one.
          </p>
        </div>
        <Button asChild className="w-full shrink-0 sm:w-auto">
          <Link href="/onboard">Onboard a merchant</Link>
        </Button>
      </div>
      <MerchantList />
    </div>
  );
}
