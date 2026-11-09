## ADDED Requirements

### Requirement: Admins can check in an attendee from a payment row

Each payment row on the event page that is pending or received and not yet checked in SHALL offer a Check-In action that checks the attendee in with one tap, using the same one-time check-in as the scan result. Voided and already checked-in rows SHALL offer none, and the list SHALL refresh to the payment's true state after every attempt.

#### Scenario: Search and check in

- **WHEN** an admin searches for an attendee's name and taps Check-In on the matching row
- **THEN** the payment is checked in, and the row shows "Checked in" and no Check-In action

#### Scenario: Find the row

- **WHEN** an admin uses the existing search (payer name or reference) or status filter
- **THEN** the matching rows offer Check-In as described above

#### Scenario: Pending payment

- **WHEN** the row is a pending payment
- **THEN** it offers Check-In, and checking in does not change its status or amounts

#### Scenario: Already checked in

- **WHEN** another admin checked the attendee in before this admin taps Check-In
- **THEN** the admin is told they are already checked in, the first time and admin are kept, and the row refreshes to show "Checked in"

#### Scenario: Voided payment

- **WHEN** a payment is voided
- **THEN** its row offers no Check-In action, and if it was voided after the list loaded the tap is refused and the row refreshes

#### Scenario: Not an admin

- **WHEN** the check-in request comes from a signed-in user who is not an admin of the event chat, or from nobody
- **THEN** it is refused and nothing is recorded

#### Scenario: Filter and search stay

- **WHEN** a check-in completes while a search or status filter is active
- **THEN** the list refreshes with the same search and filter and the rows already loaded stay in place
