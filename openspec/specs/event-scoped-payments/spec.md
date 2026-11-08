# Event-Scoped Payments Specification

## Purpose

Defines how payments are created against an event and listed within an event scope. The event name becomes the fixed SGQR tag-62.01 description for every payment in the event; per-payment description input is removed.

## Requirements

### Requirement: /start produces a payment linked to an event

After the user picks an event and provides the payer details, `/start` SHALL collect an **amount** (integer-cents validation as in existing `parseAmount`), obtain the user's confirmation, and then create a `payments` row with `event_id` set to the chosen event. The `qr_payload` MUST encode the event's payee proxy and use the event name as the description (tag 62.01). The payment row MUST snapshot-copy `payee_type`, `payee_value`, and `description` (set to the event name at creation time) — subsequent edits to the event MUST NOT alter existing payments.

#### Scenario: Happy path — single open event

- **WHEN** user runs `/start` in a chat with one open event "AZURA's Birthday" (payee +6591234567), provides a valid payer proxy, skips the name, enters "12.50", and taps Confirm
- **THEN** bot creates `payments` row with `event_id` pointing at the event, `description = "AZURA's Birthday"`, `amount_cents = 1250`, `status = 'pending'`, uploads BMP QR to Telegram via sendPhoto, and shows caption: "AZURA's Birthday / SGD 12.50 / ref XXXX / Forward this message to share"

#### Scenario: Invalid amount re-prompt

- **WHEN** user enters "twelve" or "-5" as the amount
- **THEN** bot replies "Please enter a valid amount (e.g. 10.00)" and re-prompts without creating a payment

#### Scenario: Cancel mid-start

- **WHEN** user runs `/start`, picks an event, provides payer details, then types "cancel" (or taps Cancel) before confirming
- **THEN** no `payments` row is created, flow exits

#### Scenario: Expired conversation mid-start

- **WHEN** 10-minute alarm fires while user is mid-flow (payer, name, amount entry, or the confirmation summary)
- **THEN** no `payments` row is created; next `/start` begins a fresh flow

### Requirement: /start lists events to pick from

Before the amount step, `/start` SHALL present the set of open events in the current chat. The selection is required — no default event is assumed.

#### Scenario: Multiple open events, user picks one

- **WHEN** user runs `/start`, sees three event buttons, and taps the second
- **THEN** bot proceeds to the amount prompt for that event only

#### Scenario: User picks a closed event via stale button

- **WHEN** user opens a cached button for a just-closed event
- **THEN** bot replies "This event is closed. Run /init to open a new one." and does not proceed

### Requirement: Payment record carries event_id

Every `payments` row SHALL have a non-null `event_id` (FK to `events.id`). The `description` column on the row is set to the event name at creation time and never rewritten by the bot (it becomes a historical snapshot).

#### Scenario: Later event rename does not affect payment

- **WHEN** an event's name is conceptually "edited" (future feature)
- **THEN** already-created payments in that event retain the event name as it was at payment creation (current design: no rename exists yet, but the row is immutable by construction)

### Requirement: /payments shows per-event summary

The top-level `/payments` view SHALL show each event with its payment count, total collected amount, total paid back amount, and total pending amount. The collected amount SHALL be the received payments' amounts minus their **sent** paybacks; pending and cancelled paybacks SHALL NOT reduce it. The paid back amount SHALL be the total of sent paybacks. Voided payments SHALL NOT be counted in the payment count or any total.

#### Scenario: Event with mixed statuses

- **WHEN** event E has 3 payments: received(1000), pending(500), received(200), and no paybacks
- **THEN** top-level view shows: "E — 3 payments, $12.00 collected, $0.00 paid back, $5.00 pending"

#### Scenario: Event with no payments

- **WHEN** event was just created
- **THEN** top-level view shows: "E — 0 payments, $0 collected"

#### Scenario: Voided payment excluded

- **WHEN** event E has received(1000), pending(500) and voided(700)
- **THEN** top-level view shows: "E — 2 payments, $10.00 collected, $0.00 paid back, $5.00 pending", and the `/end_event` summary uses the same figures

#### Scenario: Sent payback reduces collected

- **WHEN** event E has received(1000) with a sent payback of 300
- **THEN** top-level view shows $7.00 collected and $3.00 paid back, and the `/end_event` summary shows the same

#### Scenario: Pending and cancelled paybacks do not reduce collected

- **WHEN** event E has received(1000) with a pending payback of 300 and a cancelled payback of 200
- **THEN** top-level view shows $10.00 collected and $0.00 paid back

### Requirement: Event close does not alter payment records

Closing an event SHALL NOT alter any existing payment rows or their statuses (pending/received, payback bounds, etc.). The `closeEvent` transition only mutates `events.status` and `events.closed_at`.

#### Scenario: Payback after event close

- **WHEN** event is closed and a received payment has remaining payback capacity
- **THEN** `/payback <ref>` still creates a payback row bounded by `payments.amount_cents`

### Requirement: /start collects payer details before the amount

After the event is chosen, `/start` SHALL ask for the payer's PayNow proxy (mandatory, validated and normalized like `/payback`) and then an optional display name (skippable), before the amount. The created `payments` row MUST snapshot `payer_type`, `payer_value`, and `payer_name`. The payer's name MAY appear in the QR caption; the payer's PayNow proxy MUST NOT.

#### Scenario: Happy path with payer proxy and name

- **WHEN** user runs `/start` on a single open event, enters payer `91234567`, enters name "Alice", then amount "12.50"
- **THEN** bot creates a `payments` row with `payer_type = 'mobile'`, `payer_value = '+6591234567'`, `payer_name = 'Alice'`, `amount_cents = 1250`, and sends the QR with a caption that includes "Payer: Alice" and does not include the number

#### Scenario: Name skipped

- **WHEN** user enters a valid payer proxy and taps **Skip** on the name prompt
- **THEN** bot proceeds to the amount prompt, the created payment has `payer_name = NULL`, and the QR caption has no payer segment

#### Scenario: Invalid payer proxy

- **WHEN** user enters a payer proxy that is neither a valid SG mobile nor a valid UEN
- **THEN** bot rejects the input with an explanatory message, re-prompts for the payer, and creates nothing

#### Scenario: Cancel during payer steps

- **WHEN** user types "cancel" at the payer or name prompt
- **THEN** no `payments` row is created and the flow exits

### Requirement: /start asks for confirmation before creating the payment

After a valid amount, `/start` SHALL present a confirmation summary showing the event, the payer (name when given, and PayNow proxy), the payee the QR will pay to, and the amount, with **✅ Confirm** and **❌ Cancel** buttons. No `payments` row SHALL be created and no QR rendered until the user confirms. Confirming SHALL re-check that the event is still open, and repeated Confirm taps SHALL create at most one payment.

#### Scenario: Summary shown before any QR

- **WHEN** the user enters a valid amount "12.50" for payer "Alice" (+6591234568) on event "Dinner" paying +6591234567
- **THEN** the bot shows a summary with the event, "Alice (+6591234568)", the payee +6591234567 and "SGD 12.50" plus Confirm/Cancel buttons, and creates no payment and sends no QR

#### Scenario: Confirm creates the payment

- **WHEN** the user taps ✅ Confirm
- **THEN** the bot creates the `payments` row, sends the QR photo with its usual caption and action buttons, and updates the summary message to show it was confirmed

#### Scenario: Cancel creates nothing

- **WHEN** the user taps ❌ Cancel, or types "cancel"
- **THEN** no `payments` row is created and the summary is updated to say the request was cancelled

#### Scenario: Double tap

- **WHEN** the user taps ✅ Confirm twice in quick succession
- **THEN** exactly one payment and one QR are created

#### Scenario: Event closed before confirming

- **WHEN** the event is closed after the summary is shown and the user taps ✅ Confirm
- **THEN** no payment is created and the user is told the event is closed

#### Scenario: Text while confirming

- **WHEN** the user types text while the summary is showing
- **THEN** the bot asks them to tap Confirm or Cancel and changes nothing

### Requirement: Web payer requests use the event snapshot

Payment requests created from the payer-facing event page SHALL be linked to the selected event, use its current payee and name at creation time, and retain the signed-in creator as the payment owner.

#### Scenario: Event-linked request

- **WHEN** a payer submits a valid request for event `E`
- **THEN** the payment stores `E` as its event, snapshots `E`'s payee and name, and stores the authenticated payer-page user as owner

### Requirement: Payer-page requests use pending payment semantics

A valid payer-page submission SHALL create the same kind of pending payment request as the existing manual payment flow, without changing receipt or void behavior.

#### Scenario: Pending after creation

- **WHEN** a payer successfully creates a request
- **THEN** its status is `pending`, its amount is fixed in the SGQR payload, and it can later be settled through existing payment-management actions
