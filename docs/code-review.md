# Code review checklist

Instructions for any reviewer of a change to event-paynow: a person, or an AI agent of any kind
(Claude Code, Codex, Cursor, Copilot, Gemini CLI and others). Tool-specific wrappers only point
here, so this file is the single source.

## How to review

1. Read `AGENTS.md` for the architecture and conventions, then the change: the diff, and the
   code it calls and is called by, not only the changed lines.
2. If the change has an OpenSpec folder (`openspec/changes/<name>/`), read its proposal, specs and
   tasks, and check the code does what the specs say.
3. Run `npm run build`, `npm run check` and `npm test` when you can, and report the result.
4. Do not edit files. Report findings only.

## What to report

Report only real problems. Each finding has:

- **Where:** `path:line`.
- **What goes wrong:** a concrete input or situation and the wrong result. No case, no finding.
- **Fix:** the smallest change that solves it.

Order: bugs and security first, then missing tests for risky logic, then rule breaks below, then
anything else worth fixing. Skip style preferences and vague worries. If nothing is wrong, say so
in one line and list what you checked.

## Project rules to check

- **Correctness and safety:** wrong results, missed edge cases (empty, zero, rounding, time zones),
  check-then-write races, swallowed errors, data loss.
- **Names only:** QR captions, QR image text, chat messages and the CSV never contain a PayNow
  number (mobile or UEN). Owner-only messages may show `Name (proxy)`.
- **Money:** amounts are integer cents (`parseAmount` / `formatCents`), never floats.
- **Migrations:** new files in `drizzle/` are additive and backward compatible (the migration runs
  before the deploy); `0000_initial_schema.sql` is never renamed; `src/db/schema.ts`, the test
  schema in `test/workers/harness.ts` and the repository tests' own schemas are updated with it.
- **Registrant details:** payer email and custom answers are returned only by the admin CSV export,
  never by lists, payment views, captions, direct messages or chat messages.
- **Web pages:** user-typed text is written with `textContent`, never `innerHTML`; POST routes keep
  the same-origin JSON check; event data needs the session (cookie or bearer) and the live
  chat-admin check; CSV cells that start like a formula are neutralised.
- **Pages bundle:** code under `src/web/` imports only from `src/{web,db,sgqr,payments,access}`
  and `src/commands/payer-label.ts`; a new import needs the deploy filter in
  `.github/workflows/deploy.yml` updated. `src/split-app/` never imports from `src/web/`.
- **Telegram:** callback data stays under 64 bytes; button taps check the conversation step and
  owner; Durable Object responses in handlers are consumed or cancelled.
- **Tests:** new branches, parsers, money and security logic have a test that fails when the code
  is broken.
- **Docs and specs:** README, AGENTS.md and `docs/architecture.md` describe changed behaviour;
  OpenSpec deltas match the code.
