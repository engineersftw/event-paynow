# Spec Delta

## MODIFIED Requirements

### Requirement: /payments shows per-event summary

The top-level `/payments` view SHALL show each event with its payment count, total collected amount, total paid back amount, and total pending amount. The collected amount SHALL be the received payments' amounts minus their **sent** paybacks; pending and cancelled paybacks SHALL NOT reduce it. The paid back amount SHALL be the total of sent paybacks. Voided payments SHALL NOT be counted in the payment count or any total.

#### Scenario: Event with mixed statuses

- **WHEN** event E has 3 payments: received(1000), pending(500), received(200), and no paybacks
- **THEN** top-level view shows: "E — 3 payments, $12.00 collected, $0.00 paid back, $5.00 pending"

#### Scenario: Event with no payments

- **WHEN** event was just created
- **THEN** top-level view shows: "E — 0 payments, $0 collected"

#### Scenario: Voided payment excluded

- **WHEN** event E has received(1000), pending(500) and voided(700)
- **THEN** top-level view shows: "E — 2 payments, $10.00 collected, $0.00 paid back, $5.00 pending", and the `/end_event` summary uses the same figures

#### Scenario: Sent payback reduces collected

- **WHEN** event E has received(1000) with a sent payback of 300
- **THEN** top-level view shows $7.00 collected and $3.00 paid back, and the `/end_event` summary shows the same

#### Scenario: Pending and cancelled paybacks do not reduce collected

- **WHEN** event E has received(1000) with a pending payback of 300 and a cancelled payback of 200
- **THEN** top-level view shows $10.00 collected and $0.00 paid back
