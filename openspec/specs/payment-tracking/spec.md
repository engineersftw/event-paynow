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

### Requirement: Records support automated receipt updates later

The payment record SHALL carry a stable, unique payment reference that is encoded in the issued QR, so a future automated payment notification can correlate a bank-side transaction to the record; the system SHALL in this version change `pending` to `received` only via the owner's manual action.

#### Scenario: Correlating reference is unique and stable

- **WHEN** a payment record is created
- **THEN** its payment reference is unique across records, embedded in the QR payload, and unchanged by status transitions