# Tasks

## 1. Data model

- [x] 1.1 Add `defaultAmountCents` (`default_amount_cents`, nullable integer) to `events` in `src/db/schema.ts`; generate `drizzle/0006_*.sql` (an `ADD COLUMN` only) with `npm run db:generate` and format its meta with Biome
- [x] 1.2 Add `defaultAmountCents: number | null` to `Event` and an optional `defaultAmountCents` to the `createEvent` input in `src/db/repository.ts`; persist and map it in `src/db/drizzle-repository.ts` (positive integer or null)
- [x] 1.3 Add the column to every hand-written test schema (`test/workers/harness.ts` and any inline DDL such as `event-repository.test.ts`); repository and migration tests cover create with and without a default

## 2. /init

- [x] 2.1 Add the optional default amount step (3) to `src/commands/init-handler.ts` with `parseAmount` validation, a Skip button (`init_skip_amount:<userId>`), the confirmation (now step 4) and success messages showing the amount, and the cancel path
- [x] 2.2 Route `init_skip_amount:` to the init handler in `src/bot.ts`
- [x] 2.3 Update the init handler and bot wiring tests: set an amount, skip, invalid amounts, cancel; adapt the existing end-to-end `/init` tests to answer the new step

## 3. /start

- [x] 3.1 In `src/commands/start-handler.ts`, show "Use SGD x.xx" (`start_use_default`) on the amount prompt when the event has a default, from both the name step and the Skip path; the tap re-reads the event, rejects stale sessions and closed events, and continues exactly like a typed amount
- [x] 3.2 Route `start_use_default` in `src/bot.ts`; tests: use the default, type a different amount, event without a default, stale tap, closed event

## 4. Web admin

- [x] 4.1 Return `event.defaultAmountCents` from `eventData` in `src/web/handler.ts`
- [x] 4.2 Pre-fill the dialog amount in `src/web/page.ts` on open and on "Create another"; empty when there is no default
- [x] 4.3 Tests: API returns the default (number or null), page markup and script behaviour

## 5. Docs and checks

- [x] 5.1 Update `AGENTS.md`, `README.md` (the `/init` description and flow) and `docs/architecture.md`
- [x] 5.2 Run `npm run check`, `npm run build` and `npm test`; confirm the migration file contains only the additive `ALTER TABLE`
