# Event-Scoped Payments Specification

## Purpose

Defines how payments are created against an event and listed within an event scope. The event name becomes the fixed SGQR tag-62.01 description for every payment in the event; per-payment description input is removed.

## Requirements

### Requirement: /start produces a payment linked to an event

After the user picks an event, `/start` SHALL collect an **amount** (integer-cents validation as in existing `parseAmount`) and create a `payments` row with `event_id` set to the chosen event. The `qr_payload` MUST encode the event's payee proxy and use the event name as the description (tag 62.01). The payment row MUST snapshot-copy `payee_type`, `payee_value`, and `description` (set to the event name at creation time) — subsequent edits to the event MUST NOT alter existing payments.

#### Scenario: Happy path — single open event

- **WHEN** user runs `/start` in a chat with one open event "AZURA's Birthday" (payee +6591234567), enters "12.50"
- **THEN** bot creates `payments` row with `event_id` pointing at the event, `description = "AZURA's Birthday"`, `amount_cents = 1250`, `status = 'pending'`, uploads BMP QR to Telegram via sendPhoto, and shows caption: "AZURA's Birthday / SGD 12.50 / ref XXXX / Forward this message to share"

#### Scenario: Invalid amount re-prompt

- **WHEN** user enters "twelve" or "-5" as the amount
- **THEN** bot replies "Please enter a valid amount (e.g. 10.00)" and re-prompts without creating a payment

#### Scenario: Cancel mid-start

- **WHEN** user runs `/start`, picks an event, then types "cancel" before confirming the amount
- **THEN** no `payments` row is created, flow exits

#### Scenario: Expired conversation mid-start

- **WHEN** 10-minute alarm fires while user is mid-amount-entry
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

The top-level `/payments` view SHALL show each event with its payment count, total collected amount, and total pending amount.

#### Scenario: Event with mixed statuses

- **WHEN** event E has 3 payments: received(1000), pending(500), received(200)
- **THEN** top-level view shows: "E — 3 payments, $12.00 collected, $5.00 pending"

#### Scenario: Event with no payments

- **WHEN** event was just created
- **THEN** top-level view shows: "E — 0 payments, $0 collected"

### Requirement: Event close does not alter payment records

Closing an event SHALL NOT alter any existing payment rows or their statuses (pending/received, payback bounds, etc.). The `closeEvent` transition only mutates `events.status` and `events.closed_at`.

#### Scenario: Payback after event close

- **WHEN** event is closed and a received payment has remaining payback capacity
- **THEN** `/payback <ref>` still creates a payback row bounded by `payments.amount_cents`