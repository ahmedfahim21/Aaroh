import { compare } from "bcrypt-ts";
import NextAuth, { type DefaultSession } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import { DUMMY_PASSWORD } from "@/lib/constants";
import { createGuestUser, getUser, createOrGetNearUser } from "@/lib/db/queries";
import { verifyNearAccount } from "@/lib/near/auth";
import { authConfig } from "./auth.config";

export type UserType = "guest" | "regular" | "near";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      type: UserType;
      nearAccountId?: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    id?: string;
    email?: string | null;
    nearAccountId?: string | null;
    type: UserType;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    type: UserType;
    nearAccountId?: string | null;
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
      credentials: {},
      async authorize({ email, password }: any) {
        const users = await getUser(email);

        if (users.length === 0) {
          await compare(password, DUMMY_PASSWORD);
          return null;
        }

        const [user] = users;

        if (!user.password) {
          await compare(password, DUMMY_PASSWORD);
          return null;
        }

        const passwordsMatch = await compare(password, user.password);

        if (!passwordsMatch) {
          return null;
        }

        return { ...user, type: "regular" };
      },
    }),
    Credentials({
      id: "guest",
      credentials: {},
      async authorize() {
        const [guestUser] = await createGuestUser();
        return { ...guestUser, type: "guest" };
      },
    }),
    Credentials({
      id: "near",
      credentials: {
        nearAccountId: { label: "NEAR Account ID", type: "text" },
      },
      async authorize(credentials: any) {
        const { nearAccountId } = credentials;

        if (!nearAccountId) {
          return null;
        }

        // Verify NEAR account exists on-chain
        const accountInfo = await verifyNearAccount(nearAccountId);

        if (!accountInfo) {
          console.error("NEAR account verification failed:", nearAccountId);
          return null;
        }

        // Create or get user with NEAR account
        const [nearUser] = await createOrGetNearUser(nearAccountId);

        return { ...nearUser, type: "near" };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.type = user.type;
        token.nearAccountId = user.nearAccountId;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.type = token.type;
        session.user.nearAccountId = token.nearAccountId;
      }

      return session;
    },
  },
});
