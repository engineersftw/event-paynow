## ADDED Requirements

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

## MODIFIED Requirements

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
