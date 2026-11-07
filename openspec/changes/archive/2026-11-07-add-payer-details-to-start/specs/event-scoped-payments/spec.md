## ADDED Requirements

### Requirement: /start collects payer details before the amount

After the event is chosen, `/start` SHALL ask for the payer's PayNow proxy (mandatory, validated and normalized like `/payback`) and then an optional display name (skippable), before the amount. The created `payments` row MUST snapshot `payer_type`, `payer_value`, and `payer_name`, and payer details MUST NOT appear in the QR caption.

#### Scenario: Happy path with payer proxy and name

- **WHEN** user runs `/start` on a single open event, enters payer `91234567`, enters name "Alice", then amount "12.50"
- **THEN** bot creates a `payments` row with `payer_type = 'mobile'`, `payer_value = '+6591234567'`, `payer_name = 'Alice'`, `amount_cents = 1250`, and sends the QR with the unchanged caption

#### Scenario: Name skipped

- **WHEN** user enters a valid payer proxy and taps **Skip** on the name prompt
- **THEN** bot proceeds to the amount prompt and the created payment has `payer_name = NULL`

#### Scenario: Invalid payer proxy

- **WHEN** user enters a payer proxy that is neither a valid SG mobile nor a valid UEN
- **THEN** bot rejects the input with an explanatory message, re-prompts for the payer, and creates nothing

#### Scenario: Cancel during payer steps

- **WHEN** user types "cancel" at the payer or name prompt
- **THEN** no `payments` row is created and the flow exits

## MODIFIED Requirements

### Requirement: /start produces a payment linked to an event

After the user picks an event and provides the payer details, `/start` SHALL collect an **amount** (integer-cents validation as in existing `parseAmount`) and create a `payments` row with `event_id` set to the chosen event. The `qr_payload` MUST encode the event's payee proxy and use the event name as the description (tag 62.01). The payment row MUST snapshot-copy `payee_type`, `payee_value`, and `description` (set to the event name at creation time) — subsequent edits to the event MUST NOT alter existing payments.

#### Scenario: Happy path — single open event

- **WHEN** user runs `/start` in a chat with one open event "AZURA's Birthday" (payee +6591234567), provides a valid payer proxy, skips the name, and enters "12.50"
- **THEN** bot creates `payments` row with `event_id` pointing at the event, `description = "AZURA's Birthday"`, `amount_cents = 1250`, `status = 'pending'`, uploads BMP QR to Telegram via sendPhoto, and shows caption: "AZURA's Birthday / SGD 12.50 / ref XXXX / Forward this message to share"

#### Scenario: Invalid amount re-prompt

- **WHEN** user enters "twelve" or "-5" as the amount
- **THEN** bot replies "Please enter a valid amount (e.g. 10.00)" and re-prompts without creating a payment

#### Scenario: Cancel mid-start

- **WHEN** user runs `/start`, picks an event, provides payer details, then types "cancel" before confirming the amount
- **THEN** no `payments` row is created, flow exits

#### Scenario: Expired conversation mid-start

- **WHEN** 10-minute alarm fires while user is mid-flow (payer, name, or amount entry)
- **THEN** no `payments` row is created; next `/start` begins a fresh flow
