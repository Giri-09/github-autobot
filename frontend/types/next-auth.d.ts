import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      login: string;
    } & DefaultSession["user"];
  }
}

import "next-auth/jwt";

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    id?: string;
    login?: string;
  }
}
