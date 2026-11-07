## MODIFIED Requirements

### Requirement: QR delivered as inline image

The system SHALL send the generated QR as an image message in the same chat, with a caption identifying the description, amount, and payment reference, and the payer's display name when one was provided.

#### Scenario: Image response

- **WHEN** a payment QR is generated for a user
- **THEN** the reply contains the QR rendered as an image with a caption showing description, amount, and payment reference

#### Scenario: Caption with payer name

- **WHEN** a payment QR is generated for a payer named "Alice"
- **THEN** the caption also shows "Payer: Alice" after the payment reference, and never the payer's PayNow number
