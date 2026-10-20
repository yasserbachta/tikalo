import NextAuth from "next-auth";
import authConfig from "./auth.config";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "./lib/db";
import { getUserById } from "./data/user";

// How long a JWT may go without a fresh DB check before the jwt callback
// re-validates it (claims, existence, tokenVersion). Bounds the window in which
// a revoked or stale token still works.
const REVALIDATE_WINDOW = 5 * 60 * 1000;

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "credentials") return true;
      const existingUser = await getUserById(user.id || "");
      if (!existingUser) return false;
      return true;
    },
    async session({ token, session }) {
      if (token.sub && session.user) {
        session.user.id = token.sub;
      }
      if (session.user) {
        session.user.role = token.role!;
        session.user.agencyId = token.agencyId ?? null;
        session.user.agencyExpiry = token.agencyExpiry ?? null;
        session.user.agencyPlan = token.agencyPlan ?? null;
        session.user.name = token.name;
        session.user.email = token.email as string;
      }
      return session;
    },
    async jwt({ token, user, trigger }) {
      if (!token.sub) return token;

      // Re-hit the DB on sign-in, on update/signUp triggers, when claims are
      // missing, or once the revalidation window has elapsed — so revocations
      // and claim changes take effect without waiting for token expiry.
      const stale =
        !token.lastChecked || Date.now() - token.lastChecked > REVALIDATE_WINDOW;

      if (
        user ||
        trigger === "update" ||
        trigger === "signUp" ||
        !token.role ||
        stale
      ) {
        const existingUser = await getUserById(token.sub);
        // Fail closed: a deleted user's token is invalidated immediately.
        if (!existingUser) return null;
        // Revoked: the token's version no longer matches the user's.
        if (
          token.version != null &&
          token.version !== existingUser.tokenVersion
        ) {
          return null;
        }

        token.name = existingUser.name;
        token.email = existingUser.email;
        token.role = existingUser.role;
        token.agencyId = existingUser.agencyId;
        // Epoch ms (or null) — survives JSON serialization, cheap to compare on
        // the upload path.
        token.agencyExpiry = existingUser.agency?.expiryDate?.getTime() ?? null;
        token.agencyPlan = existingUser.agency?.plan ?? null;
        token.version = existingUser.tokenVersion;
        token.lastChecked = Date.now();
      }

      return token;
    },
  },
  adapter: PrismaAdapter(db),
  // Bound the session lifetime so a token can't outlive a week even if it never
  // hits the revalidation path. maxAge is in seconds.
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
});
