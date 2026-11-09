# Proposal

## Why

The `drizzle/` folder has 9 migration files (0000 to 0008, 113 lines in total), each with its own Drizzle snapshot. A single baseline file is easier to read and review, and new contributors see the whole schema in one place. The squash must not disturb the live database, which has already applied all nine files.

## What Changes

- Replace migrations 0000 to 0008 with **one baseline, `drizzle/0000_initial_schema.sql`**, the same name as the first migration. The live D1 database records applied migrations by file name, so it skips this file; a fresh database gets the complete schema in one step.
- The baseline is **the real final schema, taken from running the old chain on an empty database** (not regenerated from `src/db/schema.ts`, which has no CHECK constraints), and the two are proven identical by comparing tables, columns, constraints, indexes and foreign keys.
- Drizzle metadata is reset to match: one journal entry (`0000_initial_schema`) and one snapshot (`0000_snapshot.json`, taken from the latest snapshot), so `npm run db:generate` produces `0001_...` as the next migration and reports no changes when the schema is unchanged.
- Rehearsal with Wrangler's own local D1: apply the old chain, swap in the baseline, run `migrations apply` again, and confirm it reports nothing to apply.
- The migration test is rewritten to apply every file in `drizzle/` and check the final schema, including the CHECK constraints, instead of reading only migrations 0000 and 0001.
- Docs: AGENTS.md and README mention the single baseline and the rule that its name must not change.

Out of scope: changing the schema, touching the production database or the deploy workflow, regenerating anything from `schema.ts`, adding `check()` definitions to `schema.ts`.

## Capabilities

### New Capabilities

- `database-migrations`: how the migration history is kept: a baseline that deployed databases skip, and a fresh-database schema equal to the production schema.

### Modified Capabilities

(none)

## Impact

- Removed: `drizzle/0001_*.sql` to `0008_*.sql` and snapshots `0001` to `0008`; replaced: `drizzle/0000_initial_schema.sql`, `drizzle/meta/0000_snapshot.json`, `drizzle/meta/_journal.json`; rewritten: `test/node/migration.test.ts`; docs.
- No deploy of its own: the `migrate` job in `deploy.yml` runs when `drizzle/` changes and, on the live database, finds nothing to apply (verified by the rehearsal, and visible in the job's log).
- Git history keeps every old migration file.
