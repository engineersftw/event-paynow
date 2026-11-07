# Spec Delta

## ADDED Requirements

### Requirement: Payment QR image shows the payment details

The system SHALL print the payment details as visible text inside the QR image itself, below the QR code: the event name, the description, the amount, the payment reference, and the payer's display name when one was provided. The image SHALL NOT contain any PayNow number, and the QR code SHALL remain scannable.

#### Scenario: Details printed on the image

- **WHEN** a payment QR is generated for event "Team Lunch", description "Dinner split", amount 12.50, reference `ABC123DEFG` and payer name "Alice"
- **THEN** the image shows lines for the event, the description, `SGD 12.50`, the reference and `Payer: Alice` beneath the QR code

#### Scenario: No payer name

- **WHEN** a payment QR is generated with no payer name
- **THEN** the image omits the payer line and shows the remaining details

#### Scenario: No PayNow number on the image

- **WHEN** a payment QR is generated for a payer with a PayNow proxy
- **THEN** the proxy value does not appear as text on the image

#### Scenario: Long or unsupported text

- **WHEN** a detail line is longer than the image width or contains characters the image font cannot draw
- **THEN** the line is truncated with an ellipsis and unsupported characters are drawn as `?`, and the QR still decodes to the same payload
