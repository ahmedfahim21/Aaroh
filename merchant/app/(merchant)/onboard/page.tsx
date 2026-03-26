import { OnboardForm } from "@/components/merchant/onboard-form";

const privyEnabled = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);

export const metadata = {
  title: "Onboard Merchant – Aaroh",
  description: "Become compliant with Agentic Commerce in seconds.",
};

export default function OnboardPage() {
  return (
    <div className="flex flex-col gap-6 p-6 max-w-2xl mx-auto w-full">
      <div>
        <h1 className="text-xl font-semibold">Onboard Merchant</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload a catalogue to generate a UCP-ready merchant package.
        </p>
      </div>
      <OnboardForm privyEnabled={privyEnabled} />
    </div>
  );
}
