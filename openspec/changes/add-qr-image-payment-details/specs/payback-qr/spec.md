# Spec Delta

## ADDED Requirements

### Requirement: Payback QR image shows the payback details

The system SHALL print the payback details as visible text inside the payback QR image, below the QR code: the original payment reference, the amount, the payback reference, and the recipient's display name when one is known. The image SHALL NOT contain any PayNow number, and the QR code SHALL remain scannable.

#### Scenario: Details printed on the image

- **WHEN** a payback of 5.00 with reference `PB123456789` is delivered against payment `ABC123DEFG` to a recipient named "Bob"
- **THEN** the image shows lines `Payback for ABC123DEFG`, `SGD 5.00`, the payback reference and `To: Bob` beneath the QR code

#### Scenario: Recipient without a known name

- **WHEN** a payback is delivered to a recipient with no known name
- **THEN** the image omits the recipient line and shows the remaining details
