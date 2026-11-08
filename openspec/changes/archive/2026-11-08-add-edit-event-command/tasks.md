# Tasks

## 1. Data layer

- [x] 1.1 Add `updateEvent(ref, patch)` to `EventRepository` and `D1EventRepository`: guarded update on `status = 'open'`, returning the updated event or `null`. Verify with workers repository tests: each field updates, clearing the default amount stores `null`, a closed or unknown ref returns `null` and changes nothing.

## 2. Command handler

- [x] 2.1 Add `edit` to the flow enum in `src/worker/conversation-do.ts`. Verify with `npm run build`.
- [x] 2.2 Create `src/commands/edit-event-handler.ts` (start, field callbacks, text input, cancel) reusing `detectProxyType`, `parseAmount` and the name rule from `/init`, with the admin check at start and before the write. The success reply lists the final name, payee and default amount from the updated row. Verify with node-pool unit tests covering the spec scenarios (including the full final-values reply): name, payee, amount set and cleared, invalid inputs re-prompt, non-admin refusal at start and at write, closed event, no open events, other-chat event, cancel.

## 3. Wiring and docs

- [x] 3.1 Wire `/edit_event`, the `edit_*` callbacks and the text routing in `src/bot.ts` (including `stampOwner` and the help text). Verify with a bot-wiring test and an e2e flow test (`/edit_event` → pick field → value → event row updated, existing payment unchanged).
- [x] 3.2 Update README (command table, BotFather list, project structure, specs count), AGENTS.md and `docs/architecture.md`. Verify by reading the diff.
- [x] 3.3 Run `npm run check`, `npm run build` and `npm test`; all pass.
