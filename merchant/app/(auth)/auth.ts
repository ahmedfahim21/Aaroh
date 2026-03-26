import NextAuth, { type DefaultSession } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import { getOrCreateUserByWallet } from "@/lib/db/queries";
import { authConfig } from "./auth.config";

export type UserType = "regular";
export type UserRole = "consumer" | "merchant";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      type: UserType;
      role: UserRole;
    } & DefaultSession["user"];
  }

  interface User {
    id?: string;
    email?: string | null;
    type: UserType;
    role: UserRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    type: UserType;
    role: UserRole;
  }
}

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      id: "wallet",
      credentials: { walletAddress: {}, role: {} },
      async authorize({ walletAddress, role }: any) {
        const dbUser = await getOrCreateUserByWallet(
          walletAddress,
          role ?? "merchant"
        );
        return { ...dbUser, type: "regular" as UserType };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.type = user.type;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.type = token.type;
        session.user.role = token.role;
      }
      return session;
    },
  },
});
