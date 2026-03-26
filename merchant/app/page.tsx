import { redirect } from "next/navigation";
import { auth } from "./(auth)/auth";
import { MerchantLoginPage } from "@/components/merchant-login-page";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await auth();

  if (session?.user) {
    if (session.user.role === "consumer") {
      redirect(process.env.NEXT_PUBLIC_CONSUMER_APP_URL ?? "http://localhost:3000");
    }
    redirect("/dashboard");
  }

  return <MerchantLoginPage />;
}
