# Spec Delta

## ADDED Requirements

### Requirement: Event page shows check-in statistics
The Web Admin event page SHALL show event-wide counts for checked-in payments, not-checked-in received payments, and not-checked-in pending payments, excluding voided payments.

#### Scenario: Mixed event check-in states
- **WHEN** an event has 2 checked-in payments, 3 received payments not checked in, 4 pending payments not checked in, and 1 voided payment
- **THEN** the page shows Checked in = 2, Not checked in (paid) = 3, and Not checked in (pending) = 4

#### Scenario: No check-ins
- **WHEN** an event has no checked-in payments and has 2 received and 1 pending payment
- **THEN** the page shows zero checked in, 2 not checked in (paid), and 1 not checked in (pending)

### Requirement: Check-in statistics are event-wide and refresh with the page
The check-in statistics SHALL be computed across the whole event and SHALL not change with search, status filters, or pagination; normal page refreshes after actions SHALL update them.

#### Scenario: Filter does not change statistics
- **WHEN** an administrator filters the payment list to voided payments or searches for one payer
- **THEN** the check-in statistics still represent every non-voided payment in the event

#### Scenario: Check-in refreshes statistics
- **WHEN** an administrator checks in a pending or received payment
- **THEN** the statistics refresh and move that payment into Checked in from its previous category

#### Scenario: Voided payment is omitted
- **WHEN** a payment is voided before or after the page loads
- **THEN** it contributes to none of the check-in statistics
