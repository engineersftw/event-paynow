# Tasks

## 1. Build and prove the baseline

- [x] 1.1 Throwaway script (not committed): apply the nine original files from `git show main:drizzle/...` to in-memory SQLite and write the final schema (tables, then indexes, in dependency order, with `--> statement-breakpoint` separators) to the new `drizzle/0000_initial_schema.sql`
- [x] 1.2 Prove equivalence: build one database from the original chain and one from the baseline and compare normalised `sqlite_master` SQL, `table_info`, `index_list` and `foreign_key_list` for every table; the comparison must show no differences

## 2. Reset the Drizzle metadata

- [x] 2.1 Delete migrations `0001` to `0008` and snapshots `0001` to `0008`; write `drizzle/meta/0000_snapshot.json` (latest snapshot content, new `id`, zero `prevId`) and a one-entry `_journal.json` with tag `0000_initial_schema`; format the meta files with Biome
- [x] 2.2 Check `npm run db:generate` reports no schema changes, and that a throwaway column added to a scratch copy of the schema produces `0001_...sql` containing only that column (then discard the scratch change)

## 3. Rehearse with Wrangler

- [x] 3.1 In a temporary persist directory apply the original chain with `wrangler d1 migrations apply paynow-db --local`, insert a row, swap in the baseline files and apply again: it must report nothing to apply and keep the row; in a second temporary directory apply only the baseline to an empty database and compare its schema with the first

## 4. Tests and docs

- [x] 4.1 Rewrite `test/node/migration.test.ts` to apply every `drizzle/*.sql` file in name order and check tables, columns, indexes, the counters' key and the CHECK constraints (bad `payments.status`, `paybacks.status` and `events.status` values are rejected)
- [x] 4.2 Update `AGENTS.md` and `README.md`: one baseline, its name must never change, later migrations start at `0001`, CHECK constraints live only in the SQL
- [x] 4.3 Run `npm run check`, `npm run build`, the full test suite and `openspec validate --specs`
