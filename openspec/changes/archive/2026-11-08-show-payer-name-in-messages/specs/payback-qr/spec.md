## ADDED Requirements

### Requirement: Payback messages show the recipient's name

The system SHALL show the payback recipient's display name wherever it identifies the person, when a name is known (only the payment's stored payer has one). Photo captions and the text lines replacing them show the name only (`To: <name>`), never the number; owner-facing messages show `Name (proxy)`.

#### Scenario: Payback QR caption

- **WHEN** a payback to the stored payer "Alice" is recorded and its QR is delivered
- **THEN** the caption includes "To: Alice" after the payback reference and does not include the number

#### Scenario: Status lines

- **WHEN** that payback is marked sent or cancelled from the QR photo
- **THEN** the replacement text line includes "To: Alice" before the status

#### Scenario: Changed recipient has no name

- **WHEN** the owner changed the recipient to another proxy
- **THEN** the payback caption and status lines carry no "To:" segment, and owner-facing messages show the bare proxy

#### Scenario: Prompts and history

- **WHEN** the owner reaches the amount step, the amount confirmation, the "Payback Recorded" message, or views the payment detail with that payback
- **THEN** each shows the recipient as "Alice (+6591234567)"
