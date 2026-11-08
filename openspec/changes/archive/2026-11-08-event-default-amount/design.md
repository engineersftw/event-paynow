# Design

## Context

`/init` (`init-handler.ts`) is a three-step flow held in the conversation Durable Object: name (1), payee (2), then a button-driven confirmation (3), and `handleCallback` accepts only step 3. `/start` (`start-handler.ts`) reads the amount at step 4 (`handleAmountInput`, which parses with `parseAmount`, loads the event and moves to the confirm step 5). The event row has no amount today; `createEvent` takes the fields of `Event`. The web admin builds its page from `eventData` and a dialog with an empty amount field; creating a request already validates `amount` with `parseAmount`. The deploy workflow applies D1 migrations before deploying when `drizzle/` changes.

## Goals / Non-Goals

**Goals:** set a default amount once at `/init`; suggest it in `/start` and the web dialog; keep every existing path working with no default.

**Non-Goals:** a fixed (non-editable) price; editing the default after creation (re-running `/init` creates a new event; an edit command can follow); per-payer amounts; a default for paybacks.

## Decisions

1. **One nullable column.** `events.default_amount_cents INTEGER` (null = none), added by migration 0006 as an `ALTER TABLE ... ADD COLUMN`. It is backward compatible (old code ignores it, old rows are null), so the migrate-before-deploy job is safe. A `CHECK (default_amount_cents IS NULL OR default_amount_cents > 0)` cannot be added to an existing column in SQLite, so validation lives in the handlers (same `parseAmount` as everywhere); the repository does not trust callers blindly and stores only positive integers or null.
2. **`/init` gains one step.** New order: name (1), payee (2), default amount (3, optional), confirm (4). Step 3 accepts text through `parseAmount` and has a Skip button (`init_skip_amount:<userId>`, same pattern as the existing buttons). The confirm callbacks now require step 4. The summary and the success message add an "Amount" line only when set. A conversation that was at the old step 3 (confirmation) at deploy time would see its confirm tap rejected as expired (they re-run `/init`); acceptable for a 10-minute window.
3. **`/start`: a button, not a skip.** The amount prompt (both the path after the name step and after Skip) gets an inline "Use SGD 21.00" button (`start_use_default`) when the chosen event has a default. The handler re-reads the event (it may be closed or have changed), then runs the same path as a typed amount, so the confirmation and everything after are untouched. Typing still works.
4. **Where the default is read.** The handler loads the event by the `eventRef` in the conversation state at the moment the amount prompt is built and again when the button is tapped; it never stores the default in the state, so there is one source of truth.
5. **Web admin.** `eventData` returns `event.defaultAmountCents` (number or null; it is not sensitive). The page keeps `defaultAmount` from the last load and the dialog's `showForm` sets the amount input to `(cents / 100).toFixed(2)` or empty; `showForm` runs on open and on "Create another", so both restore the default. The server never applies the default itself: the POST still requires an amount.
6. **Callback routing.** `bot.ts` routes `init_skip_amount:` to the init handler and `start_use_default` to the start handler, as the existing prefixes are.
7. **Specs.** Added requirements rather than rewrites: the existing "Create an event via /init" requirement says the flow collects a name and a proxy; the extra optional step does not contradict it, and its scenarios still hold (the happy path simply skips or answers the extra step).

## Risks / Trade-offs

- Existing tests that drive `/init` end to end must answer the new step; the test schemas that hand-write the events table must gain the column.
- A default can be mistaken for a fixed price; the button label says "Use" and typing remains possible, and the web field is editable.
- Changing the amount later needs a new event until an edit command exists.
