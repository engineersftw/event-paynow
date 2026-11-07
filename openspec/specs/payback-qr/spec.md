# Payback QR Specification

## Purpose

Generates a payback SGQR for a tracked payment in which the original payer becomes the payee, so the user who collected the payment can scan it in their own bank app and send the money back.

## Requirements

### Requirement: Initiate payback from a payment

The system SHALL let the owning user trigger a payback from a payment record, asking for the payer's PayNow reference (mobile number or UEN) and the payback amount, and SHALL validate both before generating a QR.

#### Scenario: Payback initiated from received payment

- **WHEN** the owning user triggers payback on a payment and provides a valid payer reference and a valid amount not exceeding the original payment amount
- **THEN** the system generates a payback QR encoded with the payer's reference as the payee, the payback amount, and a payback reference, delivered as an inline image

#### Scenario: Payback amount exceeds original

- **WHEN** the user enters a payback amount greater than the original payment amount
- **THEN** the system rejects the amount, prompts for a new value, and creates nothing

#### Scenario: Invalid payer reference

- **WHEN** the user enters a payer reference that is neither a valid SG mobile number format nor a valid UEN format
- **THEN** the system rejects the input with an explanatory error and re-prompts

### Requirement: Payback recorded against the payment

The system SHALL record each generated payback with its amount, payer reference, timestamp, and status (default `pending`, manually markable as `sent`), linked to the original payment, and SHALL show payback history on that payment.

#### Scenario: Partial payback history

- **WHEN** a user issues two paybacks of 5.00 and 3.00 against a 12.50 payment and views the payment
- **THEN** the payment detail shows both paybacks with amounts and statuses and the remaining payable total of 4.50

#### Scenario: Mark payback as sent

- **WHEN** the owning user marks a pending payback as sent
- **THEN** the payback status updates to `sent` with a timestamp and the payment detail reflects it

### Requirement: Paybacks bounded by payment amount

The system SHALL NOT allow the total of active paybacks against a payment to exceed the original payment amount.

#### Scenario: Over-payback blocked

- **WHEN** paybacks already total 12.50 for a 12.50 payment and the user requests another payback
- **THEN** the system refuses with a message that the payment has been fully paid back