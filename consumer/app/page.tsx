import { auth } from "./(auth)/auth";
import { redirect } from "next/navigation";
import { LandingPage } from "@/components/landing-page";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await auth();

  if (session?.user) {
    if (session.user.role === "merchant") {
      redirect(process.env.NEXT_PUBLIC_MERCHANT_APP_URL ?? "http://localhost:3001");
    }
    redirect("/chat");
  }

  return <LandingPage />;
}
