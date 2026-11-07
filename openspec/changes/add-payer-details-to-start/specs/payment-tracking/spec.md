## ADDED Requirements

### Requirement: Payment detail shows the payer

The payment detail view SHALL display the stored payer name (when present) and payer proxy (when present). Payments without payer data SHALL render unchanged.

#### Scenario: Detail with payer

- **WHEN** the owner opens a payment with payer name "Alice" and proxy `+6591234567`
- **THEN** the detail includes "Payer: Alice (+6591234567)"

#### Scenario: Detail without name

- **WHEN** the payment has a proxy but no name
- **THEN** the detail includes "Payer: +6591234567"
