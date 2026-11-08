# Spec Delta

## ADDED Requirements

### Requirement: Payment QR can be delivered inline on the web
The system SHALL support rendering a newly created payment's SGQR image in the payer-facing webpage with the same payment details and privacy rules as the existing QR image.

#### Scenario: Web QR rendering
- **WHEN** a payer-facing request is created
- **THEN** the returned page state can display a scannable QR encoding the stored payment payload, with amount and reference details beneath it

#### Scenario: Payer proxy privacy
- **WHEN** the payer-facing QR is rendered
- **THEN** the payer's PayNow proxy is encoded in the QR as required but is not printed as text in the image or result details

### Requirement: Web payer QR delivery is independent of Telegram delivery
The payer-facing QR delivery SHALL not require a Telegram chat, direct message, or successful Telegram API call.

#### Scenario: Telegram privacy restriction
- **WHEN** a user creates a request from the payer-facing page while Telegram direct messages are restricted
- **THEN** the request succeeds and the QR remains available inline on the webpage
