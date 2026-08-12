import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import { upsertUser } from "./backend";

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/signin",
  },
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
      authorization: {
        params: {
          // 'repo' scope is required to create webhooks and write labels/comments later
          scope: "read:user user:email repo",
        },
      },
    }),
  ],
  callbacks: {
    // `account`/`profile` are only present right after sign-in, not on later requests
    async jwt({ token, account, profile }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;

        try {
          await upsertUser(
            profile as { id: number; login: string; name: string | null; avatar_url: string }
          );
        } catch (err) {
          // Best-effort only - repo-connect re-syncs the user row before it's actually needed
          console.error("Failed to sync user to backend", err);
        }
      }
      return token;
    },
    // No accessToken added here - keeps it out of the client-visible session
    async session({ session }) {
      return session;
    },
  },
};
