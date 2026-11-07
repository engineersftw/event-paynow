# Tasks

## 1. Schema + Repository

- [x] 1.1 Add `events` table to `src/db/schema.ts` (ref, chat_id, topic_id default 0, name ≤ 50, payee_type/value, status open|closed, created_at, closed_at) and run `drizzle-kit generate` to produce the migration file. Verify migration file exists and parses cleanly.
- [x] 1.2 Add `event_id INTEGER NOT NULL REFERENCES events(id)` to the `payments` table in `src/db/schema.ts` and regenerate. Verify migration includes both the new table and the column addition. (Note: event_id is nullable in migration for compatibility with existing code; will be made NOT NULL when event flow is implemented in task 3.1.)
- [x] 1.3 Define `EventRepository` interface in `src/db/repository.ts`: `createEvent`, `listOpenEventsByChat`, `getEventByRef`, `closeEvent` (guarded CAS returning rowsAffected), `getEventStats` (payment count, collected_cents, pending_cents).
- [x] 1.4 Implement `D1EventRepository` in `src/db/drizzle-repository.ts` plus 20+ Workers-pool tests in a new `test/workers/event-repository.test.ts` covering: create, list-by-chat, topic isolation, close CAS (winner + duplicate-tap loser), getStats across statuses, cross-chat isolation. Node pool: keep schema-only test in `test/node/migration.test.ts` that asserts `events` columns + constraints.
- [x] 1.5 Add `events: D1EventRepository` to the bot factory wiring in `src/bot.ts` alongside existing repository injection. Verify `tsc --noEmit` green.

## 2. /init rewrite (create event)

- [ ] 2.1 Rewrite `src/commands/init-handler.ts`: flow becomes `init-name` → `init-payee` → `init-confirm` → `createEvent`. Event name is non-empty ≤ 50; payee validated as before. On confirm, create event, reply with ref + event summary.
- [ ] 2.2 Update Conversation DO state shape: replace old `init` flow states (`step: 1/2`) with the three new named states. Existing `payback`/`payments` states untouched.
- [ ] 2.3 Workers-pool tests in `test/workers/init-handler.test.ts` covering: happy path mobile, happy path UEN, invalid proxy re-prompt, cancel mid-flow (no event row), duplicate event name in same chat (warn + allow), empty name rejected.
- [ ] 2.4 Update existing Node-pool init tests (`test/node/init-handler.test.ts`) or remove if the file only covered the old per-user-payee semantics; confirm test count reflects the new flows.

## 3. /start rewrite (pick event → amount)

- [ ] 3.1 Rewrite `src/commands/start-handler.ts`: replace guard-with-description-then-amount with (a) fetch open events for `(chat_id, topic_id)`, (b) if 1 event → jump to amount; if N > 1 → inline button list; if 0 → "No open events" message, (c) amount step (existing `parseAmount` + `formatCents`), (d) on complete, `createPayment` with `event_id` set, event name as `description`, payee snapshot from event, build SGQR payload with event name as `description` option, render QR, sendPhoto with caption.
- [ ] 3.2 Reject stale button taps for closed events: button callback re-reads event by ref, rejects if `status !== 'open'`.
- [ ] 3.3 Workers-pool tests: single-event skip, multi-event pick, invalid amount re-prompt, cancel mid-flow, closed-event rejection via stale button, caption + DB row contain event name as description, QR payload uses event name as tag 62.01, payee snapshot from event not from user.
- [ ] 3.4 Update `src/bot.ts` command routing: `/start` still wired, but free-text routing table updated to recognise the new `start-pick-event` / `start-amount` states.

## 4. /end_event (close event)

- [ ] 4.1 New `src/commands/end-event-handler.ts`: `end-pick-event` → inline list of open events; `end-confirm` → echo event name + payment count + total; on confirm → `closeEvent(ref, ts)` CAS. Reply with summary (payments collected, pending).
- [ ] 4.2 Workers-pool tests: close with mixed payment statuses, double-tap (second shows "already closed"), close event still has pending paybacks (paybacks still work against received payments), close event rejects new /start (spec scenario).
- [ ] 4.3 Wire `/end_event` into `src/bot.ts` routing. Telegram requires underscores in command names — confirm `/end_event` registers and triggers.

## 5. /payments event-first

- [ ] 5.1 Rewrite `src/commands/payments-handler.ts`: top-level lists events (open + closed, sorted by `created_at DESC`, up to 10) showing payment count + collected + pending. Each event button → drills into per-event payment list with existing per-payment buttons (View, Mark as Received, Payback).
- [ ] 5.2 Workers-pool tests: empty events list, mixed statuses (open + closed), drill-in shows only that event's payments, cross-chat isolation (chat A cannot see chat B's events), Mark-as-Received button works within the event drill.

## 6. Integration + verification

- [ ] 6.1 End-to-end Workers-pool test: drive a fresh chat through `/init` (create event) → `/start` (pick event, enter amount, receive QR) → `/payments` (drill in, see the payment) → `/end_event` (close) → `/start` again (rejected). Seed a second event in the same chat to verify `/start` shows a picker.
- [ ] 6.2 Update `docs/architecture.md`: add `events` table to the data model diagram, note event-scoped conversation flows, update "What's Working" section.
- [ ] 6.3 Update `AGENTS.md` Conventions if new patterns emerge (e.g., topic_id handling).
- [ ] 6.4 Full suite green: `npm run build && npm run check && npm test` — all Node + Workers pools pass.

## Workflow follow-up

- Archive the change after tasks 1–6 land and CI is green.
- Task 1.3 (Cloudflare auth + live DB) remains blocked; when it lands, apply this change's migrations with `wrangler d1 migrations apply paynow-db --remote`.
- Live dev-bot check: run `/init` → `/start` → `/end_event` through a `cloudflared` tunnel; record outcomes in `docs/verification.md`.
