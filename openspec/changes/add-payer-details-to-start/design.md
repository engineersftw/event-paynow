# Design

## Context

`/start` (`src/commands/start-handler.ts`) is a step machine over the per-chat DO state: step 1 pick event, step 2 amount. `/payback` (`payback-handler.ts`) is step 1 payer → 2 confirm payer → 3 amount → 4 confirm amount, with `paybacks.payer_type/payer_value` already snapshotting the payer. The **Payback** button (`PaymentCallbackHandler.handlePayback`) seeds the DO with only `{ paymentRef }`, while `/payback <ref>` seeds `paymentId`, `paymentAmount`, `paymentDescription` that later steps read — so the button path cannot reach the amount step today. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Capture payer proxy (required) + name (optional) once at `/start`; reuse at payback.
- Keep legacy payments (no payer) working unchanged.

**Non-Goals:**
- Editing the payer stored on a payment, saved payers, changing the payback bound or QR payload format.

## Decisions

1. **Columns on `payments`, not a new table.** Add nullable `payer_type`, `payer_value`, `payer_name` via a new Drizzle migration (`ALTER TABLE ... ADD`, same style as `0001`). A payer is a per-payment snapshot (like `payee_*`), has no identity of its own, and nullable columns keep legacy rows valid. *Alternative:* a `payers` table — rejected as YAGNI (no reuse requirement).

2. **New `/start` steps, renumbered:** 1 pick event → 2 payer proxy → 3 payer name (Skip button, callback `start_skip_name`) → 4 amount. The proxy is validated with the existing `detectProxyType`; no confirm/echo step (the amount step message echoes the payer, and the QR is cheap to re-issue). Payer/name are accumulated in DO `context` and written only when the payment row is created, so abandon/expiry creates nothing. Both the single-event auto-advance and the picker callback now land on step 2 instead of the amount step. Typing "cancel" works at every step (already handled before the step switch).

3. **Payback proposes the stored payer, with Confirm / Change.** `PaybackCommandHandler.start` and the button path share one helper that builds the seeded state (`paymentRef`, `paymentId`, `paymentAmount`, `paymentDescription`) and, when the payment has a payer, sets `pendingPayer` and enters the **existing step 2** (payer confirm) with the message "Pay back to <name/proxy>?" and a keyboard of `✅ Confirm` (`payback_confirm_payer:`, unchanged → `proceedToAmountStep`), `✏️ Change recipient` (new `payback_change_payer:`) and `❌ Cancel`. Change sets step 1 and edits the message to the existing "enter payer's PayNow reference" prompt; the typed value goes through the existing `handlePayerReferenceInput` → step 2 confirm, overwriting `pendingPayer` in DO state only. With no stored payer it enters step 1 as today. `createPaybackRecord` already reads `context.pendingPayer` and writes it to `paybacks.payer_*`, so the stored payment payer is never mutated and downstream code is unchanged. The button handler delegates to the shared helper, fixing the divergent-state bug.

4. **Reuse the existing confirm step rather than adding a new one.** Step 2 already exists for typed payers; pre-filling it keeps one code path and one callback. *Alternative:* skip confirmation entirely — rejected: the recipient decides where money goes, and a typo at `/start` is otherwise uncorrectable. The bot.ts callback router must recognise the new `payback_change_payer:` prefix.

5. **Privacy:** the QR caption stays `description / SGD amount / ref / hint` because the message is designed to be forwarded to other people; payer proxy/name appear only in owner-facing messages (payment detail, payback prompts).

## Risks / Trade-offs

- [Extra mandatory step slows `/start`] → inherent to the requested "proxy mandatory"; name is skippable in one tap.
- [Wrong payer proxy typed at `/start`] → caught at the payback confirm step, where the recipient can be changed for that payback (the stored payer itself stays as recorded).
- [Step renumbering breaks existing tests/fixtures] → update `start-handler`, `start-flow`, `e2e-event-flow` tests as part of tasks.
- [Mid-deploy DO state from an old version at step 2 (amount) now interpreted as payer] → 10-min expiry makes this a minutes-long window; accepted.

## Migration Plan

1. Generate and commit migration `0002` (`npm run db:generate`), apply `wrangler d1 migrations apply paynow-db --remote` before deploying code that writes the columns.
2. Deploy. Rollback: redeploy previous code; extra nullable columns are harmless.
