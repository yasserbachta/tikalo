# Tests

Two Vitest **projects**, configured in `vitest.config.ts`:

| Project       | Runs                                                            | Needs Docker? |
| ------------- | -------------------------------------------------------------- | ------------- |
| `unit`        | Pure functions, Zod schemas, session-mocked auth guards        | No            |
| `integration` | Real Prisma queries/mutations against a disposable Postgres    | Yes           |

Test files are **co-located** with the code under test (`*.test.ts`). A file's
project is decided by path (see the `include`/`exclude` globs in
`vitest.config.ts`):

- `unit` — `lib/**/*.test.ts` (excluding `lib/data/**` and `lib/session.test.ts`)
- `integration` — `lib/data/**`, `lib/session.test.ts`, and `actions/**`

The integration project proves **real behavior** — most importantly that an
`AGENCY_ADMIN` cannot read or mutate another agency's tickets via
`scopedTicketWhere`. A mock can't prove that; a real query can.

## Running

```bash
# Unit only — zero setup, no Docker:
npm run test:unit

# First-time full run:
npm install
cp .env.test.example .env.test     # local, non-secret; points at the container
npm run test:db:up                 # start disposable Postgres (waits for healthy)
npm test                           # runs unit + integration

# Repeat runs (DB already up):
npm test
npm run test:integration           # integration only
npm run test:watch                 # watch mode

# Tear down when done:
npm run test:db:down               # stops the container and deletes its volume
```

## How it fits together

- `docker-compose.test.yml` — `postgres:16` on host port **5433**, data in tmpfs
  (rebuilt every run). Disposable; never touches the real Supabase DB.
- `.env.test` (from `.env.test.example`) — points `DATABASE_URL`/`DIRECT_URL` at
  the container and supplies dummy values for every var read at import time.
- `tests/setup-env.ts` — re-loads `.env.test` inside each worker before any test
  imports `lib/db` (the Prisma client reads `DATABASE_URL` at construct time).
- `tests/db/global-setup.ts` — runs once before the integration suite: refuses to
  run against a non-localhost DB, then `prisma db push --force-reset` to build the
  schema.
- `tests/db/helpers.ts` — `resetDb()` (TRUNCATE between tests) and factories
  (`makeAgency`, `makeUser`, `makeTicket`, `makeTicketVersion`, `uniq`).

## Notes

- **Integration tests run serially** (`maxWorkers: 1`, `fileParallelism: false`):
  they share one database and reset it between tests, so they cannot run in
  parallel.
- **Never point `.env.test` at a production or remote database.** The integration
  suite runs a destructive `prisma db push --force-reset` and a
  TRUNCATE-everything reset between tests. `global-setup.ts` throws unless the URL
  is on `localhost`/`127.0.0.1`, but keep `.env.test` local regardless.
- External services (Bunny storage, Resend, OpenAI) are mocked at the module
  boundary — tests never make real network calls.
