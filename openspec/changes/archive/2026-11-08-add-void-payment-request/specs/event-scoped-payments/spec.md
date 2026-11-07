## MODIFIED Requirements

### Requirement: /payments shows per-event summary

The top-level `/payments` view SHALL show each event with its payment count, total collected amount, and total pending amount. Voided payments SHALL NOT be counted in the payment count or either total.

#### Scenario: Event with mixed statuses

- **WHEN** event E has 3 payments: received(1000), pending(500), received(200)
- **THEN** top-level view shows: "E — 3 payments, $12.00 collected, $5.00 pending"

#### Scenario: Event with no payments

- **WHEN** event was just created
- **THEN** top-level view shows: "E — 0 payments, $0 collected"

#### Scenario: Voided payment excluded

- **WHEN** event E has received(1000), pending(500) and voided(700)
- **THEN** top-level view shows: "E — 2 payments, $10.00 collected, $5.00 pending", and the `/end_event` summary uses the same figures
