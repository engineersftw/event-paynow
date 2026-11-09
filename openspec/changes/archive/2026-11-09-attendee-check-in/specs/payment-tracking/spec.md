## ADDED Requirements

### Requirement: A payment records its check-in

A payment SHALL record when it was checked in and which administrator checked it in. A payment SHALL be checked in at most once, and a voided payment SHALL NOT be checked in. Check-in SHALL not change the payment's status, amount or paybacks.

#### Scenario: First check-in

- **WHEN** an administrator checks in a pending or received payment
- **THEN** the payment stores the check-in time and that administrator, and its status and amounts are unchanged

#### Scenario: Second check-in

- **WHEN** the same payment is checked in again, including by two administrators at once
- **THEN** only the first succeeds, the stored time and administrator stay as first recorded, and the other attempt is told it was already checked in

#### Scenario: Voided payment

- **WHEN** a check-in is attempted on a voided payment
- **THEN** it is refused and nothing is recorded

#### Scenario: Existing payments

- **WHEN** a payment was created before this feature
- **THEN** it counts as not checked in and everything about it works as before
