# Spec Delta

## ADDED Requirements

### Requirement: Event check-in statistics classify non-voided payments
The system SHALL classify each non-voided event payment into checked in, not checked in (paid), or not checked in (pending) based on its check-in timestamp and payment status.

#### Scenario: Classification
- **WHEN** an event contains checked-in, received-not-checked-in, pending-not-checked-in, and voided payments
- **THEN** checked-in payments count in Checked in, received-not-checked-in payments count in Not checked in (paid), pending-not-checked-in payments count in Not checked in (pending), and voided payments count in none

#### Scenario: Check-in does not alter payment totals
- **WHEN** a payment changes from not checked in to checked in
- **THEN** its payment status, amount, payback totals, and existing financial event totals remain unchanged
