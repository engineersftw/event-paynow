# Spec Delta

## ADDED Requirements

### Requirement: Payments show their net amount after sent paybacks

The system SHALL show, for a payment with at least one **sent** payback, its net amount (amount minus sent paybacks), its original amount, and the total paid back, in both the event payment list and the payment detail view. Pending and cancelled paybacks SHALL NOT reduce the net amount; the detail view SHALL show pending paybacks as a separate line when there are any. A payment without sent paybacks SHALL render as before.

#### Scenario: Event list entry with a sent payback

- **WHEN** the owner opens the payment list of an event containing a received payment of 2000 with a sent payback of 500
- **THEN** that entry shows $15.00 as its amount, the original $20.00, and $5.00 paid back

#### Scenario: Detail view with a sent payback

- **WHEN** the owner views a received payment of 2000 that has a sent payback of 500
- **THEN** the detail shows "Paid back: $5.00" and "Net: $15.00"

#### Scenario: Pending payback is shown separately

- **WHEN** the owner views a payment of 2000 with a pending payback of 500 and no sent paybacks
- **THEN** the net amount is $20.00, paid back is $0.00, and a pending paybacks line shows $5.00

#### Scenario: Payment without paybacks

- **WHEN** the owner views or lists a payment that has no sent paybacks
- **THEN** it shows only its amount, as before
