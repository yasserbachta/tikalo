import { config as loadEnv } from "dotenv";

// Runs inside every Vitest worker, before any test module is imported. lib/db.ts
// builds the Prisma client from DATABASE_URL at module-construct time, so the
// test env must be loaded here — earlier than the first `import "@/lib/db"`.
loadEnv({ path: ".env.test" });
