import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

// Load .env.test once in the config process so anything that runs here
// (globalSetup, the localhost guard rail) sees the test DB credentials. Each
// worker re-loads it via tests/setup-env.ts before importing app modules.
loadEnv({ path: ".env.test" });

// Both projects need the same module resolution as the app:
//  - `@/*` -> repo root (tsconfigPaths)
//  - `server-only` stubbed (its real entry throws outside an RSC)
// Project configs don't inherit a root `resolve`, so we apply it to each.
const resolve = {
  tsconfigPaths: true,
  alias: {
    "server-only": fileURLToPath(
      new URL("./test/server-only-stub.ts", import.meta.url),
    ),
  },
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve,
        test: {
          // Pure functions, Zod schemas, and session-mocked guards. No DB,
          // no Docker — `npm run test:unit` runs anywhere with zero setup.
          name: "unit",
          environment: "node",
          include: ["lib/**/*.test.ts"],
          exclude: [
            "lib/data/**",
            "lib/session.test.ts",
            "**/node_modules/**",
          ],
          setupFiles: ["tests/setup-env.ts"],
        },
      },
      {
        resolve,
        test: {
          // Real Prisma against the disposable Docker Postgres. These share one
          // database and must run serially (one DB, reset between tests).
          name: "integration",
          environment: "node",
          include: [
            "lib/data/**/*.test.ts",
            "lib/session.test.ts",
            "actions/**/*.test.ts",
          ],
          exclude: ["**/node_modules/**"],
          globalSetup: ["tests/db/global-setup.ts"],
          setupFiles: ["tests/setup-env.ts"],
          pool: "forks",
          maxWorkers: 1,
          fileParallelism: false,
          testTimeout: 20000,
          hookTimeout: 60000,
        },
      },
    ],
  },
});
