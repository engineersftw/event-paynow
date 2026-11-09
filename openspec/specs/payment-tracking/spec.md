# Payment Tracking Specification

## Purpose

Tracks every generated payment through its lifecycle — pending, received, or paid back — so users can see what they are owed, confirm receipts manually, and rely on records that automated notifications can update later.

## Requirements

### Requirement: Payment record created on QR issuance

The system SHALL create a payment record for every generated QR, storing the owning user, description, amount, PayNow reference encoded at generation time, status `pending`, and creation timestamp.

#### Scenario: Record created with QR

- **WHEN** a payment QR is generated
- **THEN** a payment record exists with status `pending`, the description, the amount, and the payee reference used, visible only to the requesting user

### Requirement: User can list and inspect payments

The system SHALL let a user view their payment records, including pending ones with description, amount, and age, and SHALL isolate each user's records from other users, except that a chat administrator also sees every payment of their chat's events when drilling into an event.

#### Scenario: Listing payments

- **WHEN** a user requests their payment list
- **THEN** the system shows that user's payments with status, description, amount, and date, and shows no records belonging to other users

### Requirement: Manual marking as received

The system SHALL let the owning user mark a pending payment as `received`, and SHALL reject duplicate or invalid transitions with a clear message.

#### Scenario: Mark pending payment received

- **WHEN** the owning user selects "Mark as received" for a pending payment
- **THEN** the payment status becomes `received` with a receipt timestamp and the user sees confirmation

#### Scenario: Mark an already-received payment

- **WHEN** the user attempts to mark a payment as received that is already `received`
- **THEN** the system responds that the payment is already marked and changes nothing

#### Scenario: Mark a voided payment

- **WHEN** the user attempts to mark a `voided` payment as received
- **THEN** the system responds that the payment was voided and changes nothing

### Requirement: Records support automated receipt updates later

The payment record SHALL carry a stable, unique payment reference that is encoded in the issued QR, so a future automated payment notification can correlate a bank-side transaction to the record; the system SHALL in this version change `pending` to `received` only via the owner's manual action.

#### Scenario: Correlating reference is unique and stable

- **WHEN** a payment record is created
- **THEN** its payment reference is unique across records, embedded in the QR payload, and unchanged by status transitions

### Requirement: Payment detail shows the payer

The payment detail view SHALL display the stored payer name (when present) and payer proxy (when present). Payments without payer data SHALL render unchanged.

#### Scenario: Detail with payer

- **WHEN** the owner opens a payment with payer name "Alice" and proxy `+6591234567`
- **THEN** the detail includes "Payer: Alice (+6591234567)"

#### Scenario: Detail without name

- **WHEN** the payment has a proxy but no name
- **THEN** the detail includes "Payer: +6591234567"

### Requirement: Received status and payment lists show the payer's name

The system SHALL include the payer's display name, when stored, in the text line that replaces the QR photo on ✓ Received (`Payer: <name>`, never the number) and in each entry of the `/payments` event listing. Payments without a name SHALL render unchanged.

#### Scenario: Received line with name

- **WHEN** the owner marks a payment from payer "Alice" as received
- **THEN** the replacement text line includes "Payer: Alice" and the received time

#### Scenario: Listing entry

- **WHEN** the owner opens the payments list for an event containing a payment from "Alice"
- **THEN** that entry shows "Alice"; an entry without a name shows nothing extra

### Requirement: Pending payment can be voided

The system SHALL let the owning user void a `pending` payment, setting its status to `voided`, replacing its QR image message with a text status line (`🚫 Voided` and the time; QR removed), and keeping the record. A payment that is `received`, already `voided`, or has pending/sent paybacks SHALL NOT be voidable, and concurrent ✓ Received and ✖ Void taps SHALL resolve to exactly one outcome.

#### Scenario: Void a pending payment

- **WHEN** the owner taps ✖ Void on a pending payment's QR image message
- **THEN** the payment becomes `voided`, the QR image message is replaced by a text message showing it as voided, and the record is retained

#### Scenario: Void a received payment

- **WHEN** the owner attempts to void a payment that is already `received`
- **THEN** the system refuses, states it was already received, and changes nothing

#### Scenario: Void twice

- **WHEN** the owner taps ✖ Void on a payment that is already `voided`
- **THEN** the system answers that it is already voided and changes nothing

#### Scenario: Void with active paybacks

- **WHEN** the owner attempts to void a payment that has a pending or sent payback
- **THEN** the system refuses and changes nothing

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

### Requirement: Event check-in statistics classify non-voided payments

The system SHALL classify each non-voided event payment into checked in, not checked in (paid), or not checked in (pending) based on its check-in timestamp and payment status.

#### Scenario: Classification

- **WHEN** an event contains checked-in, received-not-checked-in, pending-not-checked-in, and voided payments
- **THEN** checked-in payments count in Checked in, received-not-checked-in payments count in Not checked in (paid), pending-not-checked-in payments count in Not checked in (pending), and voided payments count in none

#### Scenario: Check-in does not alter payment totals

- **WHEN** a payment changes from not checked in to checked in
- **THEN** its payment status, amount, payback totals, and existing financial event totals remain unchanged
