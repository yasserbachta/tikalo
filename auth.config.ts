import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { getUserByEmail } from "./data/user";
import { LoginSchema } from "./lib/auth-schema";

export default {
  providers: [
    Credentials({
      async authorize(credentials) {
        const validated = LoginSchema.safeParse(credentials);
        if (!validated.success) return null;

        const { email, password } = validated.data;
        const user = await getUserByEmail(email);
        if (!user || !user.password) return null;

        const match = await bcrypt.compare(password, user.password);
        return match ? user : null;
      },
    }),
  ],
} satisfies NextAuthConfig;
