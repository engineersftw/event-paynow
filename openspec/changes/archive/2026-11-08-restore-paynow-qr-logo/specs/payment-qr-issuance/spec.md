# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: The QR image carries the bot logo in its centre`
- TO: `### Requirement: The QR image carries the PayNow logo in its centre`

## MODIFIED Requirements

### Requirement: The QR image carries the PayNow logo in its centre

The system SHALL draw the PayNow logo over a white clear box at the centre of every QR image, in place of any other logo. The logo and its clear box SHALL cover no more of the QR than error-correction level H can recover, and the QR SHALL still decode to the same payload.

#### Scenario: Logo in the centre

- **WHEN** a payment QR image is generated
- **THEN** the PayNow logo's colour appears in the centre of the QR on a white clear box, and the bot logo does not

#### Scenario: Still scannable

- **WHEN** the image is decoded for payloads of short and long length
- **THEN** each decodes to its original payload
