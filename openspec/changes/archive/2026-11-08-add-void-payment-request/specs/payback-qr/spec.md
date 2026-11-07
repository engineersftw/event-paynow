## MODIFIED Requirements

### Requirement: Initiate payback from a payment

The system SHALL let the owning user trigger a payback from a `received` payment record (by command or button), asking for the payer's PayNow reference (mobile number or UEN) and the payback amount, and SHALL validate both before generating a QR. A payment that is not `received` SHALL be refused.

#### Scenario: Payback initiated from received payment

- **WHEN** the owning user triggers payback on a payment and provides a valid payer reference and a valid amount not exceeding the original payment amount
- **THEN** the system generates a payback QR encoded with the payer's reference as the payee, the payback amount, and a payback reference, delivered as an inline image

#### Scenario: Payback amount exceeds original

- **WHEN** the user enters a payback amount greater than the original payment amount
- **THEN** the system rejects the amount, prompts for a new value, and creates nothing

#### Scenario: Invalid payer reference

- **WHEN** the user enters a payer reference that is neither a valid SG mobile number format nor a valid UEN format
- **THEN** the system rejects the input with an explanatory error and re-prompts

#### Scenario: Payback from a button on a non-received payment

- **WHEN** the owner taps a Payback button (for example a stale one) on a pending or voided payment
- **THEN** the system refuses with a message that paybacks require a received payment and starts no conversation
