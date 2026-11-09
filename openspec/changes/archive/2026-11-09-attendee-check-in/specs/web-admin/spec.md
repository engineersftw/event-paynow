## ADDED Requirements

### Requirement: Admins can scan an attendee's payment QR

The event page SHALL offer a Scan control that uses the device camera to read a payment QR and show the matching payment of this event. The QR SHALL match that payment's own QR exactly; a QR of another event, a payback QR, or any other QR SHALL be reported as not recognised and show no payment data. When the camera cannot be used, the admin SHALL be able to enter a payment reference instead.

#### Scenario: Scan a payment QR

- **WHEN** an admin scans the QR of a payment of this event
- **THEN** the page shows that payment with its payer name, amount, status and check-in state, without any PayNow number

#### Scenario: Unrecognised QR

- **WHEN** an admin scans a QR that is not one of this event's payment QRs
- **THEN** the page says the QR is not recognised and shows no payment

#### Scenario: Camera unavailable

- **WHEN** camera access is denied or unsupported
- **THEN** the page says so and lets the admin type a payment reference, which shows the same result for a payment of this event

#### Scenario: Payment not on screen

- **WHEN** the scanned payment is not among the rows currently loaded in the list
- **THEN** it is still shown in the scan result

#### Scenario: Not an admin

- **WHEN** a request to resolve a scan comes from a signed-in user who is not an admin of the event chat, or from nobody
- **THEN** it is refused and returns no payment data

### Requirement: Admins can check in an attendee from the scan result

The scan result SHALL offer a Check in action for payments that are pending or received and not yet checked in, and SHALL show the existing payment actions (mark received or void for pending, pay back for received) so an attendee can be handled in one place. Checking in SHALL work whether or not the event is closed, and every write SHALL be same-origin with a live admin check.

#### Scenario: Check in

- **WHEN** an admin taps Check in on a pending or received payment
- **THEN** the payment is checked in and the result shows it as checked in with the time

#### Scenario: Already checked in

- **WHEN** an admin scans a payment that is already checked in
- **THEN** the result shows "Already checked in" with the time and offers no Check in action

#### Scenario: Voided payment

- **WHEN** the scanned payment is voided
- **THEN** the result shows it as voided and offers no Check in action

#### Scenario: Pay back from the result

- **WHEN** the scanned payment is received and has room for a payback
- **THEN** the admin can create the payback from the result as from the list, and the result and list refresh afterwards

#### Scenario: Cross-origin write

- **WHEN** a check-in request is sent from another origin
- **THEN** it is refused and nothing is recorded

### Requirement: The payment list shows who has checked in

Each payment row on the event page SHALL show a "Checked in" mark when the payment has been checked in, and SHALL refresh after a check-in.

#### Scenario: Mark in the list

- **WHEN** a payment has been checked in
- **THEN** its row shows "Checked in" with the time or date

#### Scenario: Not checked in

- **WHEN** a payment has not been checked in
- **THEN** its row shows no check-in mark
