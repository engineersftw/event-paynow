## ADDED Requirements

### Requirement: Received status and payment lists show the payer's name

The system SHALL include the payer's display name, when stored, in the text line that replaces the QR photo on ✓ Received (`Payer: <name>`, never the number) and in each entry of the `/payments` event listing. Payments without a name SHALL render unchanged.

#### Scenario: Received line with name

- **WHEN** the owner marks a payment from payer "Alice" as received
- **THEN** the replacement text line includes "Payer: Alice" and the received time

#### Scenario: Listing entry

- **WHEN** the owner opens the payments list for an event containing a payment from "Alice"
- **THEN** that entry shows "Alice"; an entry without a name shows nothing extra
