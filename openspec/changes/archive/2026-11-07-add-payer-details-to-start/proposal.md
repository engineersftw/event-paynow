# Proposal

## Why

`/start` issues a payment QR without recording who is paying. When the collector later needs to pay money back, `/payback` makes them re-type the payer's PayNow mobile/UEN from memory. Capturing the payer once at `/start` makes the later payback a one-tap confirm plus amount, while still letting the owner redirect it.

## What Changes

- `/start` gains a **payer step** between event selection and amount: the user enters the payer's PayNow proxy (SG mobile or UEN; **mandatory**, format-validated, normalized as in `/init` and `/payback`) and then an optional display name (skippable via a **Skip** button).
- The payment row stores the payer snapshot (`payer_type`, `payer_value`, `payer_name`); all three are nullable so existing rows stay valid.
- `/payback <ref>` and the **Payback** button on the QR photo **propose the stored payer as recipient** with **Confirm** / **Change recipient** buttons instead of asking for the payer from scratch. Confirm goes to the amount step; Change reuses the existing payer prompt and applies to that payback only. Payments without a stored payer (created before this change) keep the existing prompt.
- `/payments` payment detail shows the payer name/proxy when present.
- The QR photo caption is unchanged (it is forwarded to others, so it must not leak the payer's number).
- The **Payback** button flow currently seeds only `paymentRef` into conversation state (no `paymentId` / amount), unlike `/payback <ref>`; both entry points must seed the same state so the confirm and amount steps work from either entry point.

Out of scope: editing the payer stored on a payment, payer address book / reuse across payments, changing the payback bound rules.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `event-scoped-payments`: `/start` collects payer proxy (required) and name (optional) before the amount, and the payment row snapshots them.
- `payback-qr`: payback initiation proposes the payment's stored payer for confirmation, allows changing the recipient, and prompts from scratch when none stored.
- `payment-tracking`: payment detail displays the stored payer.

## Impact

- `src/db/schema.ts` + new Drizzle migration (`drizzle/0002_*.sql`): three nullable columns on `payments`.
- `src/db/repository.ts`, `src/db/drizzle-repository.ts`: `Payment` type, `createPayment`, `toPayment`.
- `src/commands/start-handler.ts`: new steps, step renumbering, Skip callback.
- `src/commands/payback-handler.ts`, `src/commands/payment-callback-handler.ts`: skip payer step, unify seeded state, show payer in detail.
- `src/bot.ts`: route the new Skip callback.
- Tests: `test/node/start-handler.test.ts`, `payback-handler.test.ts`, `payment-callback-handler.test.ts`, `test/workers/repository.test.ts`, `e2e-event-flow.test.ts`, `start-flow.test.ts`.
