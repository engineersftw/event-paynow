# Payment QR Issuance Specification

## Purpose

Creates payment requests through a guided conversation, renders a valid SGQR PayNow QR image encoding payee, amount, and description, delivers it inline in Telegram, and lets the user share it.

## Requirements

### Requirement: Guided payment creation via /start

The system SHALL run a `/start` conversation that asks the user for the event, the payer's PayNow proxy (and optional name) and an amount, then shows a confirmation summary, and SHALL NOT generate a QR until the user has confirmed a valid summary.

#### Scenario: Successful payment conversation

- **WHEN** a configured user runs `/start`, provides a payer, a valid positive amount in SGD, and confirms the summary
- **THEN** the system generates a payment QR and replies with it as an inline image

#### Scenario: Invalid amount

- **WHEN** the user provides an amount that is not a positive number with at most 2 decimal places
- **THEN** the system rejects the input, re-prompts for the amount, and does not create a payment record

#### Scenario: Conversation abandoned

- **WHEN** the user cancels the conversation or the interaction expires before the summary is confirmed
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

The system SHALL send the generated QR as an image message in the same chat, with a caption identifying the description, amount, and payment reference, and the payer's display name when one was provided.

#### Scenario: Image response

- **WHEN** a payment QR is generated for a user
- **THEN** the reply contains the QR rendered as an image with a caption showing description, amount, and payment reference

#### Scenario: Caption with payer name

- **WHEN** a payment QR is generated for a payer named "Alice"
- **THEN** the caption also shows "Payer: Alice" after the payment reference, and never the payer's PayNow number

### Requirement: QR message can be shared

The system SHALL provide a share option on the QR message that opens Telegram's native forward/share flow so the user can select whom to send it to.

#### Scenario: Sharing a QR message

- **WHEN** the user activates the share option on a QR message
- **THEN** the user can forward or share that QR message and its image to a chosen chat via Telegram's native mechanism

### Requirement: Payment QR message offers Received and Void actions

The system SHALL attach **✓ Received** and **✖ Void** buttons to the payment QR image message delivered by `/start`, and SHALL NOT offer a Payback action on it.

#### Scenario: Buttons on delivered QR

- **WHEN** a payment QR is delivered by `/start`
- **THEN** the image message carries ✓ Received and ✖ Void buttons bound to that payment and no Payback button

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

### Requirement: The QR image carries the PayNow logo in its centre

The system SHALL draw the PayNow logo over a white clear box at the centre of every QR image, in place of any other logo. The logo and its clear box SHALL cover no more of the QR than error-correction level H can recover, and the QR SHALL still decode to the same payload.

#### Scenario: Logo in the centre

- **WHEN** a payment QR image is generated
- **THEN** the PayNow logo's colour appears in the centre of the QR on a white clear box, and the bot logo does not

#### Scenario: Still scannable

- **WHEN** the image is decoded for payloads of short and long length
- **THEN** each decodes to its original payload

### Requirement: Image text uses a smooth proportional font

The system SHALL draw the detail lines under the QR in an anti-aliased proportional font rather than a blocky pixel font, with each line on its own row, black on white, and legible at the image's width as shown in Telegram. Lines wider than the image SHALL be shortened with an ellipsis measured by the font's own widths, and characters the font does not provide SHALL be drawn as `?`.

#### Scenario: Smooth text

- **WHEN** a payment QR image is generated with detail lines
- **THEN** the lines are drawn with anti-aliased glyphs (intermediate grey levels at glyph edges) and none runs past the image edge

#### Scenario: Wide line

- **WHEN** a detail line is wider than the image
- **THEN** it is shortened with an ellipsis so that it fits

#### Scenario: Unsupported character

- **WHEN** a line contains a character outside the font's coverage
- **THEN** that character is drawn as `?`

### Requirement: /start offers the event's default amount

The system SHALL, when the chosen event has a default amount, show it on the `/start` amount prompt as a one-tap "Use SGD x.xx" button, and tapping it SHALL have the same effect as typing that amount (the flow moves to the confirmation summary). The user SHALL still be able to type a different amount. An event without a default amount SHALL show the prompt as before.

#### Scenario: Use the default

- **WHEN** an event has a default amount of 21.00 and the user reaches the amount step of `/start` and taps "Use SGD 21.00"
- **THEN** the confirmation summary shows SGD 21.00 and the payment is created only after the user confirms

#### Scenario: Type a different amount

- **WHEN** the same user types `15` instead
- **THEN** the summary shows SGD 15.00

#### Scenario: Event without a default amount

- **WHEN** an event has no default amount
- **THEN** the amount prompt has no default button

#### Scenario: Stale button

- **WHEN** the button is tapped after the conversation expired or moved on
- **THEN** the bot says the session expired and creates nothing

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

### Requirement: Payment QR captions remind the payer to keep the QR

Every Telegram message that delivers a payment QR (from `/start`, from the web admin dialog's chat post, and from the payer page's private copy) SHALL include the reminder "Keep this QR for event check-in and payment verification" in its caption, after the payer segment and before the share hint, and SHALL not add PayNow numbers.

#### Scenario: Caption from /start

- **WHEN** a payment QR is created with `/start` for payer name Alice
- **THEN** the caption reads description, amount, reference, "Payer: Alice", the keep-the-QR reminder, then the share hint

#### Scenario: Caption without a payer name

- **WHEN** the payment has no payer name
- **THEN** the caption has no payer segment and still contains the reminder before the share hint

#### Scenario: Other delivery paths

- **WHEN** the QR is posted to the event chat from the web admin dialog or sent as the payer's private copy
- **THEN** its caption contains the same reminder

#### Scenario: Paybacks unaffected

- **WHEN** a payback QR is sent
- **THEN** its caption does not contain the reminder
