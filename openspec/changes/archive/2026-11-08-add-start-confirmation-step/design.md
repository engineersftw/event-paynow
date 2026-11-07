# Design

## Context

`StartCommandHandler` is a step machine in the per-chat Durable Object (`ConversationDO`): 1 pick event → 2 payer proxy → 3 optional name → 4 amount. `handleAmountInput` parses the amount and immediately calls `createPaymentAndSendQr`, which re-checks the event is open, builds the SGQR payload, inserts the `payments` row, renders and sends the QR photo, then resets state. `/init` and `/payback` already use Confirm/Cancel `InlineKeyboard` steps that update the prompt message in place. The DO exposes `GET /state`, `POST /state` (merge) and `POST /reset`; handlers do read-then-write, which is not atomic across concurrent webhook deliveries. See proposal.md for scope.

## Goals / Non-Goals

**Goals:** a confirm step before anything is persisted or rendered; exactly-once creation on Confirm; reuse the existing Confirm/Cancel UX.

**Non-Goals:** field-level editing from the summary (Confirm + Cancel only, per the user's choice); changes to the QR caption, buttons or payload.

## Decisions

1. **New step 5 holds the validated amount.** `handleAmountInput` stores `amountCents` in the DO context, sets step 5 and replies with the summary + `✅ Confirm` (`start_confirm`) / `❌ Cancel` (`start_cancel`). Nothing is written to D1 and no QR is rendered before Confirm. Callback data carries no payment data (state lives in the DO, as with `start_skip_name`).

2. **Summary content (plain text, no parse_mode):** event name; `Payer: Name (proxy)` via `plainPayerLabel`; `Pay to: <event payee proxy>`; `Amount: SGD 12.50`. The event is fetched for the payee and re-checked open when the summary is built.

3. **Atomic claim on Confirm via a new DO route.** Read-then-reset in the handler can race when Telegram delivers two taps concurrently. Add `POST /claim` to `ConversationDO` with body `{ flow, step }`: if the stored state matches it atomically resets to idle and returns the previous state (200), otherwise returns 409. Because a DO processes requests one at a time, exactly one tap wins. `handleConfirm` claims first, then creates the payment from the claimed context. *Alternatives:* reset-then-create in the handler (narrow race remains); idempotency key on `payments.ref` (needs schema change). Rejected.

4. **Confirm outcome.** Winner: edit the summary message in place ("✅ Confirmed") then run the existing `createPaymentAndSendQr` (event re-check, payment insert, QR + buttons) with the claimed amount. Loser (409): `answerCallbackQuery` "already processed or expired — run /start". If creation fails after the claim the state is already idle, so the message becomes "❌ Failed to create the payment. Run /start again." — previously the user could retype the amount; with a claim-first flow a retry means re-running `/start`.

5. **Cancel and text.** `start_cancel` (and typed `cancel` / `/cancel`, already handled before the step switch) resets state and edits the summary to "❌ Start cancelled. No payment was created."; any other text at step 5 gets "tap a button" nudge (default branch).

6. **Spec cleanup.** `payment-qr-issuance`'s "Guided payment creation via /start" still described a description-then-amount flow predating events; rewritten to the current flow as part of this change.

## Risks / Trade-offs

- [Extra tap on every `/start`] → intended; the user asked for it.
- [Typos need Cancel + restart] → explicitly chosen (Confirm + Cancel only); field editing can be added later.
- [Claim-first means a DB/render failure loses the conversation] → clear error message; no row is written on failure (insert is the last-but-one step; render failure after insert leaves a pending row exactly as today).
- [In-flight conversations at step 4 during deploy] → still work: amount typed after deploy lands on the new summary step; conversations at step 5 can't exist before deploy.
- [New DO route] → covered by workers tests (success once, 409 on repeat and on mismatch, state reset).
