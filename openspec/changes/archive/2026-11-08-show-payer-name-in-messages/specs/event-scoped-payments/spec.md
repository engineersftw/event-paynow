## MODIFIED Requirements

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
