import { execSync } from "node:child_process";

// Runs once before the integration suite. Builds the schema into the disposable
// Docker Postgres with `prisma db push`. The schema is reproduced from
// prisma/schema.prisma alone — tikalo has no migrations folder and no custom
// SQL (triggers/functions/extensions), so no extra DDL step is needed.
export default function setup() {
  const url = process.env.DATABASE_URL ?? "";

  // GUARD RAIL: `--force-reset` drops and recreates the public schema. Refuse to
  // run it unless we're pointed at a local database — never a remote/prod DB.
  const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
  if (!isLocal) {
    throw new Error(
      `Refusing to reset a non-local database. DATABASE_URL must point at ` +
        `localhost/127.0.0.1 for the integration suite (got: ${url || "<unset>"}). ` +
        `Did you forget to copy .env.test.example to .env.test?`,
    );
  }

  execSync("npx prisma db push --skip-generate --accept-data-loss --force-reset", {
    stdio: "inherit",
    env: process.env,
  });
}
