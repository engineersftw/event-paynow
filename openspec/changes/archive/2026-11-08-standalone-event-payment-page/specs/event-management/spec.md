# Spec Delta

## ADDED Requirements

### Requirement: Events expose a payer-facing link
The system SHALL provide a stable payer-facing URL for each event that can be shared with participants independently of the Telegram chat.

#### Scenario: Shareable event link
- **WHEN** a participant receives an event's payer-facing URL and opens it
- **THEN** the URL identifies the intended event and presents its Telegram sign-in flow

### Requirement: Event default amount is the payer-page amount
The payer-facing event page SHALL use the event's configured default amount as the non-editable amount for new requests when that configuration is available, and SHALL request a user-entered amount otherwise.

#### Scenario: Configured default
- **WHEN** an event has a default amount and a user signs in to its payer page
- **THEN** a new payment form shows that amount as read-only and uses it for the payment

#### Scenario: Event without configured default
- **WHEN** an event has no default amount and a user signs in to its payer page
- **THEN** the page shows an editable required amount field and does not invent an amount
