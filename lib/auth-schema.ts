import { z } from "zod";

// Credentials login shape. Kept free of any next-auth import so it can be reused
// by the login server action (actions/auth.ts) and unit-tested without dragging
// the next-auth runtime into the test.
export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Self-service agency signup. The email doubles as the agency email and the
// admin user's login. Kept next to LoginSchema and free of any next-auth /
// prisma import so it can be reused by the signup action and unit-tested.
export const SignupSchema = z.object({
  name: z.string().trim().min(1, "Enter your agency name"),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(6, "Password must be at least 6 characters"),
});
