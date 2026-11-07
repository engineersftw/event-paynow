## MODIFIED Requirements

### Requirement: Guided payment creation via /start

The system SHALL run a `/start` conversation that asks the user for the event, the payer's PayNow proxy (and optional name) and an amount, then shows a confirmation summary, and SHALL NOT generate a QR until the user has confirmed a valid summary.

#### Scenario: Successful payment conversation

- **WHEN** a configured user runs `/start`, provides a payer, a valid positive amount in SGD, and confirms the summary
- **THEN** the system generates a payment QR and replies with it as an inline image

#### Scenario: Invalid amount

- **WHEN** the user provides an amount that is not a positive number with at most 2 decimal places
- **THEN** the system rejects the input, re-prompts for the amount, and does not create a payment record

#### Scenario: Conversation abandoned

- **WHEN** the user cancels the conversation or the interaction expires before the summary is confirmed
- **THEN** the system creates no payment record and acknowledges the cancellation
