# database-migrations Specification

## Purpose

Keeps the database migration history as a single baseline plus later additive migrations, so a fresh database gets exactly the schema the live database has, and the live database never re-runs a migration it already applied.

## Requirements

### Requirement: The history is one baseline that deployed databases skip

The system SHALL keep the migration history as a single baseline file, `drizzle/0000_initial_schema.sql`, followed by later migrations numbered from `0001`. The baseline SHALL keep the file name that the live database has already recorded as applied, so applying migrations to the live database finds nothing to run.

#### Scenario: Live database

- **WHEN** migrations are applied to a database that already ran the original history
- **THEN** Wrangler reports no migrations to apply and the database is unchanged

#### Scenario: Fresh database

- **WHEN** migrations are applied to an empty database
- **THEN** the complete current schema is created by the baseline alone

### Requirement: The baseline produces the schema the full history produced

The baseline SHALL create exactly the schema that applying the original nine migrations in order creates, including every table, column and default, every CHECK constraint, every foreign key and every index. It SHALL be derived from the result of applying that history, not regenerated from the Drizzle schema definitions, which do not describe the CHECK constraints.

#### Scenario: Schema comparison

- **WHEN** a database is built from the original history and another from the baseline
- **THEN** their table definitions, columns, indexes and foreign keys are identical

#### Scenario: Constraints kept

- **WHEN** a payment with a status other than pending, received or voided is inserted into a database built from the baseline
- **THEN** the insert is rejected by the CHECK constraint

### Requirement: Later migrations continue from the baseline

The Drizzle journal and snapshot SHALL describe the baseline as migration `0000`, so that generating the next migration produces `0001`, and so that generating again with an unchanged schema reports no changes.

#### Scenario: No pending changes

- **WHEN** `npm run db:generate` is run right after the squash
- **THEN** it reports that there are no schema changes to migrate

#### Scenario: Next migration

- **WHEN** a column is later added to the Drizzle schema and `npm run db:generate` is run
- **THEN** it creates `0001_...sql` containing only that addition

### Requirement: The migration tests cover the whole history

The automated tests SHALL apply every migration file in `drizzle/` in order to an empty database and check the resulting tables, columns, CHECK constraints and indexes.

#### Scenario: A migration is added

- **WHEN** a new migration file is added to `drizzle/`
- **THEN** the test applies it after the baseline without any change to the test, and fails if the file does not apply cleanly
