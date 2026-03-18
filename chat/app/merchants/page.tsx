import { MerchantList } from "@/components/merchant/merchant-list";

export const metadata = { title: "Merchants – Aaroh" };

export default function MerchantsPage() {
  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto w-full">
      <div>
        <h1 className="text-xl font-semibold">Merchants</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Onboarded merchants. Start a UCP server for each one.
        </p>
      </div>
      <MerchantList />
    </div>
  );
}
