import { db } from "@/lib/db";

export const getUserByEmail = async (email: string) => {
  try {
    return await db.user.findUnique({ where: { email } });
  } catch {
    return null;
  }
};

export const getUserById = async (id: string) => {
  try {
    // Pull the agency's expiry + plan alongside the user so the jwt callback can
    // stamp them onto the token without a second query.
    return await db.user.findUnique({
      where: { id },
      include: { agency: { select: { expiryDate: true, plan: true } } },
    });
  } catch {
    return null;
  }
};
