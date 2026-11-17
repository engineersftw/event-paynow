## ADDED Requirements

### Requirement: The payment QR shows its reference to the payee

The system SHALL put the payment's unique reference at the start of the QR's bill-number field, followed by a space and the event name, cut at the field's 25-character limit so the reference is never shortened, with characters outside printable ASCII left out and no trailing space. The reference SHALL also stay in its existing field, so a scanned QR can still be matched to its payment.

#### Scenario: Reference and event name

- **WHEN** a payment with reference `K7M2QX4TNB` is created for the event "Birthday Party"
- **THEN** the QR's bill-number field reads `K7M2QX4TNB Birthday Party`

#### Scenario: Long event name

- **WHEN** the event name is longer than the room left after the reference
- **THEN** the field holds the whole reference and as much of the name as fits in 25 characters

#### Scenario: Event name without printable ASCII

- **WHEN** the event name has no printable ASCII characters
- **THEN** the field holds the reference alone, without a trailing space

#### Scenario: Check-in still matches

- **WHEN** an attendee's new QR is scanned for check-in
- **THEN** it is found by the same stored payload and reference as before

#### Scenario: Earlier QRs are unchanged

- **WHEN** a payment was created before this change
- **THEN** its stored QR payload is not altered
