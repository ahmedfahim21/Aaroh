import { TransactionList } from "@/components/commerce/transaction-list";

export const metadata = { title: "Transactions – Aaroh" };

export default function TransactionsPage() {
  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto w-full">
      <div>
        <h1 className="text-xl font-semibold">Transactions</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your order history across all merchants.
        </p>
      </div>
      <TransactionList />
    </div>
  );
}
