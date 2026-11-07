## ADDED Requirements

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

## MODIFIED Requirements

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
