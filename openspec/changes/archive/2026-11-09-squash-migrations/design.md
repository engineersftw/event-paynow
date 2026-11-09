# Design

## Context

- Production D1 (`paynow-db`) has applied all of `0000_initial_schema` to `0008_usage_counters`. `wrangler d1 migrations apply` (used by the deploy `migrate` job and by hand) keeps the applied file names in the `d1_migrations` table and runs any local file whose name is not in it; applied names with no local file are not an error.
- `drizzle/meta/_journal.json` and the `00NN_snapshot.json` files belong to `drizzle-kit generate`, which diffs `src/db/schema.ts` against the latest snapshot. Wrangler does not read them. The journal's first tag, `0000_sticky_wendell_rand`, already differs from the file on disk (`0000_initial_schema.sql`).
- `src/db/schema.ts` has no `check()` definitions, but the SQL has CHECK constraints (only on the three `status` columns of `events`, `payments` and `paybacks`; migrations 0003 and 0004 rebuilt tables to widen them). The `paybacks` table has no foreign key in the real schema (the test harness's hand-written copy does). The hand-written test schema in `test/workers/harness.ts` mirrors them separately.
- `better-sqlite3` is installed (used by `test/node/migration.test.ts`, which today only reads migrations 0000 and 0001), so schemas can be compared in memory.
- Everything is small: 9 SQL files, 113 lines.

## Goals / Non-Goals

**Goals:** one baseline equal to the current schema; no effect on the live database; the next generated migration is `0001`.

**Non-Goals:** schema changes, touching production, regenerating from `schema.ts`, adding `check()` to the Drizzle schema, rewriting history in Git.

## Decisions

1. **Keep the name `0000_initial_schema.sql`.** It is already recorded as applied in production, so applying skips it; the deleted `0001` to `0008` names are simply ignored there. A new baseline name would be run against the live database and fail on "table already exists".
2. **Derive the baseline from the old chain, not from Drizzle.** A throwaway script (not committed) applies the nine original files, in order, to an in-memory SQLite database (taken from `git show main:drizzle/...` so it does not depend on the working tree), then reads `sqlite_master` and writes each CREATE statement. Statements are kept in dependency order (tables, then indexes), each separated by `--> statement-breakpoint` like the other files, with the table and column definitions exactly as SQLite stores them (including CHECK and FOREIGN KEY clauses).
3. **Prove equivalence, then keep a permanent guard.** One-off proof: build one database from the old chain and one from the baseline and compare `sqlite_master` SQL (normalised for whitespace), `PRAGMA table_info`, `index_list` and `foreign_key_list` for every table. Permanent guard: the rewritten `test/node/migration.test.ts` applies every `drizzle/*.sql` file in name order, then asserts the expected tables, columns, indexes, that bad `payments.status`, `paybacks.status` and `events.status` values are rejected by CHECK, and the (day, metric) key of `usage_counters`. It does not assert a foreign key, because the real schema has none. Because it loops over the folder, a future migration needs no test edit.
4. **Reset Drizzle metadata to match.** `drizzle/meta/0000_snapshot.json` is the content of the current latest snapshot (`0008_snapshot.json`) with a new `id` and `prevId` set to the all-zero UUID; `_journal.json` has one entry (`idx` 0, tag `0000_initial_schema`, `breakpoints: true`, `when` of the original first entry). Then `npm run db:generate` must say there is nothing to migrate, and adding a column in a scratch copy must produce `0001_...`.
5. **Rehearse with Wrangler's real tool.** In a temporary persist directory: `wrangler d1 migrations apply paynow-db --local --persist-to <tmp>` with the old files (nine rows in `d1_migrations`), then swap in the baseline files and run it again: it must report nothing to apply and leave the data untouched; then seed a row first to show the data survives. A second temporary directory applies only the baseline to prove the fresh path.
6. **No change to the deploy.** The `migrate` job triggers on changes under `drizzle/`, so merging this PR runs `wrangler d1 migrations apply --remote`, which will list nothing to apply. That log line is the production confirmation.
7. **Format:** `npx biome format --write drizzle/meta` as for earlier migrations (the generated JSON otherwise fails `npm run check`).

## Risks / Trade-offs

- **Wrangler behaviour with applied-but-missing files** is relied on, not documented guarantees; the local rehearsal exercises it with the same tool and version (4.159.0), and the deploy log shows the live result. If production ever reported the baseline as unapplied, the migration would fail on existing tables without changing data (the baseline would be run in a single failing transaction), and reverting the PR restores the old files.
- **Name lock-in:** `0000_initial_schema.sql` can never be renamed, or it would be re-applied to live databases. AGENTS.md says so.
- **Old per-step history is gone from the folder** (still in Git). Anyone with an unusual copy of the database at an intermediate version (a local dev database at migration 0003, say) must recreate it; local databases are disposable.
- **CHECK constraints still live only in SQL.** After the squash, `drizzle-kit generate` may write an `ALTER` that ignores them, as it does today; any table rebuild must still be hand-written with its CHECKs. Unchanged by this work, now noted in AGENTS.md.
