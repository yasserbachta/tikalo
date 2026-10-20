import { UserRole, AgencyPlan } from "@prisma/client";
import { DefaultSession } from "next-auth";
import { JWT } from "next-auth/jwt";

export type ExtendedUser = {
  role: UserRole;
  agencyId: string | null;
  agencyExpiry: number | null;
  agencyPlan: AgencyPlan | null;
} & DefaultSession["user"];

declare module "next-auth" {
  interface Session {
    user: ExtendedUser;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: UserRole;
    agencyId?: string | null;
    agencyExpiry?: number | null;
    agencyPlan?: AgencyPlan | null;
    // tokenVersion snapshot + last DB revalidation time (epoch ms) for
    // server-side session revocation. See the jwt callback in auth.ts.
    version?: number;
    lastChecked?: number;
  }
}
