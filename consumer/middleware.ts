import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "./app/(auth)/auth";

const PUBLIC_PATHS = ["/"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths and Next.js internals
  if (
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const session = await auth();

  // Unauthenticated → back to landing
  if (!session?.user) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Merchant who ended up on consumer app → send to merchant app
  if (session.user.role === "merchant") {
    const merchantUrl =
      process.env.NEXT_PUBLIC_MERCHANT_APP_URL ?? "http://localhost:3001";
    return NextResponse.redirect(merchantUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
