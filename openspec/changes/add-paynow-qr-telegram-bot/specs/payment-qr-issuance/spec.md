# Spec Delta

## Purpose

Creates payment requests through a guided conversation, renders a valid SGQR PayNow QR image encoding payee, amount, and description, delivers it inline in Telegram, and lets the user share it.

## ADDED Requirements

### Requirement: Guided payment creation via /start
The system SHALL run a `/start` conversation that asks the user for a payment description and then an amount, and SHALL NOT generate a QR until both are provided in valid form.

#### Scenario: Successful payment conversation
- **WHEN** a configured user runs `/start`, provides a non-empty description and a valid positive amount in SGD
- **THEN** the system generates a payment QR and replies with it as an inline image

#### Scenario: Invalid amount
- **WHEN** the user provides an amount that is not a positive number with at most 2 decimal places
- **THEN** the system rejects the input, re-prompts for the amount, and does not create a payment record

#### Scenario: Conversation abandoned
- **WHEN** the user cancels the conversation or the interaction expires before both inputs are collected
- **THEN** the system creates no payment record and acknowledges the cancellation

### Requirement: QR encodes a valid SGQR PayNow payload
The system SHALL encode in each QR an EMVCo Merchant-Presented payload with the user's Payee reference (proxy type and value), currency SGD, the requested amount as a fixed (non-editable) transaction amount, a unique payment reference, and a correct CRC16 checksum, so that participating bank apps can process the payment.

#### Scenario: Payload contents for a mobile proxy payment
- **WHEN** a QR is generated for reference `+6591234567`, amount `12.50`, description "Dinner split"
- **THEN** the payload includes the PayNow merchant account template with proxy type mobile and that value, currency `702`, amount `12.50`, the description or the unique payment reference it carries, and a valid CRC16 over the payload

#### Scenario: Description exceeds SGQR field limits
- **WHEN** the provided description is longer than the QR payload field limit (25 characters)
- **THEN** the system still generates a valid QR using a truncated or reference-based encoding and shows the full description in the message text

### Requirement: QR delivered as inline image
The system SHALL send the generated QR as an image message in the same chat, with a caption identifying the description, amount, and payment reference.

#### Scenario: Image response
- **WHEN** a payment QR is generated for a user
- **THEN** the reply contains the QR rendered as an image with a caption showing description, amount, and payment reference

### Requirement: QR message can be shared
The system SHALL provide a share option on the QR message that opens Telegram's native forward/share flow so the user can select whom to send it to.

#### Scenario: Sharing a QR message
- **WHEN** the user activates the share option on a QR message
- **THEN** the user can forward or share that QR message and its image to a chosen chat via Telegram's native mechanism
