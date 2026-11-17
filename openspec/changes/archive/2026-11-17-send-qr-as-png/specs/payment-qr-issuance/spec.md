## ADDED Requirements

### Requirement: QR images are sent to Telegram as PNG files

The system SHALL send every payment QR, payback QR and Simple bot QR image to Telegram as a PNG file, including the payment QR the web pages post to the event chat or send to the payer in a direct message. The picture, its caption and its buttons SHALL be unchanged, and the QR SHALL still decode to the same payload.

#### Scenario: Event bot payment QR

- **WHEN** a payment is confirmed in `/start`
- **THEN** the QR photo is uploaded as a PNG and decodes to the payment's PayNow payload

#### Scenario: Payback QR

- **WHEN** a payback is created
- **THEN** its QR photo is uploaded as a PNG

#### Scenario: Simple bot QR

- **WHEN** a Simple bot request is confirmed
- **THEN** the QR photo is uploaded as a PNG

#### Scenario: Web page copies

- **WHEN** the payment page or the admin page sends the QR to Telegram
- **THEN** the photo is uploaded as a PNG
