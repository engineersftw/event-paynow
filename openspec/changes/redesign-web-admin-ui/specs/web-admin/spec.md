# Spec Delta

## ADDED Requirements

### Requirement: The event page uses a consistent, responsive design

The system SHALL present the event page with a shadcn/ui-style design system: shared colour, spacing and radius tokens, card, badge, button, input and dialog components, and automatic light and dark themes following the viewer's preference. The page SHALL be usable at phone width without horizontal scrolling, and statuses SHALL be shown as badges that do not rely on colour alone.

#### Scenario: Phone width

- **WHEN** an admin opens the page on a 375px wide screen
- **THEN** the totals and the payment list fit the screen without horizontal scrolling

#### Scenario: Dark preference

- **WHEN** the viewer's system prefers a dark theme
- **THEN** the page uses the dark colour tokens

### Requirement: Payments are shown as a compact list with expandable details

The system SHALL list each payment as one compact row showing the payer name when known, amount, net amount, status badge and created time, and SHALL NOT repeat the description, which is the event name already shown in the page header. Paybacks and other details SHALL NOT be displayed until the admin expands the row.

#### Scenario: Default view

- **WHEN** an admin opens an event with payments that have paybacks
- **THEN** each payment is one compact row and no payback is listed yet

### Requirement: Paybacks are revealed from an indicator on the row

The system SHALL show an indicator on a payment's row when it has paybacks or can still be paid back, with the number of paybacks when there are any. Tapping the indicator SHALL expand the row to show its paybacks (status, recipient name, QR of pending paybacks, Sent and Cancel actions) and the pay back form; tapping it again SHALL collapse it. A row with neither paybacks nor anything to pay back SHALL show no indicator.

#### Scenario: Payment with paybacks

- **WHEN** a payment has 2 paybacks and the admin taps its indicator
- **THEN** both paybacks are shown with their status and actions

#### Scenario: Received payment without paybacks

- **WHEN** a received payment has remaining amount and no paybacks
- **THEN** its indicator opens the pay back form only

#### Scenario: Fully settled payment

- **WHEN** a voided payment, or one with nothing left to pay back and no paybacks, is listed
- **THEN** it shows no payback indicator

### Requirement: Pending payments reveal their QR and actions on demand

The system SHALL NOT load the QR image of a pending payment when the page loads. A pending payment SHALL show a pending indicator; tapping it SHALL show the payment's QR image and its Received and Void buttons, and tapping it again SHALL hide them. The QR image SHALL be requested only when revealed.

#### Scenario: Page load

- **WHEN** an admin opens an event with pending payments
- **THEN** no payment QR image is requested

#### Scenario: Reveal a pending payment

- **WHEN** the admin taps the indicator of a pending payment
- **THEN** its QR image and the Received and Void buttons are shown

### Requirement: Payment requests are created in a dialog

The system SHALL offer creating a payment request through a "New request" button that opens a modal dialog holding the payer, optional name and amount fields. The button SHALL be offered only for an open event. The dialog SHALL close with Escape, a close button or a tap outside it, keep keyboard focus inside while open, and show validation errors inside the dialog without losing the entered values.

#### Scenario: Open and close

- **WHEN** the admin taps "New request" and then presses Escape
- **THEN** the dialog opens over the page and closes, leaving the list unchanged

#### Scenario: Validation error

- **WHEN** the admin submits an invalid payer or amount
- **THEN** the error is shown in the dialog and the entered values are kept

#### Scenario: Closed event

- **WHEN** the event is closed
- **THEN** the page offers no "New request" button

## MODIFIED Requirements

### Requirement: A created payback shows its QR image

The system SHALL show the payback QR image for each pending payback when the payment's paybacks are expanded, and immediately after a payback is created, with the payback details printed below the QR (original payment reference, amount, payback reference, and the recipient's name when known; never the recipient's number as text), and SHALL serve the image only to an authorised admin of the payback's event.

#### Scenario: QR after creating

- **WHEN** a payback is created successfully
- **THEN** its payment's paybacks are expanded and the payback's QR image is shown, encoding the payback payable to the recipient

### Requirement: A created payment request shows its QR and is posted to the chat

The system SHALL show the new payment's QR image in the dialog, with the payment details printed below the QR (description, amount, reference, and the payer's name when known; never the payer's number as text), and SHALL post the QR photo to the event's Telegram chat, in the event's topic, with the same caption as `/start` and ✓ Received / ✖ Void buttons. If posting to the chat fails, the payment SHALL remain recorded and the page SHALL say it could not be posted.

#### Scenario: QR on the page and in the chat

- **WHEN** a payment request is created from the page
- **THEN** the dialog shows its QR image and the event's chat receives the QR photo with the caption and buttons

#### Scenario: Posting to the chat fails

- **WHEN** the bot cannot post to the event's chat
- **THEN** the payment stays recorded, the QR is still shown in the dialog, and the page says it was not posted to the chat
