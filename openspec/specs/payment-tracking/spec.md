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

The system SHALL let a user view their payment records, including pending ones with description, amount, and age, and SHALL isolate each user's records from other users.

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
