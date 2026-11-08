# Event Payment Page Specification

## Purpose

Provides a public, payer-facing event page where anyone with the event link can authenticate with Telegram, create a payment request for themselves, and receive the payment QR inline without relying on Telegram message delivery.

## Requirements

### Requirement: Payer page is available from an event link
The system SHALL provide a distinct payer-facing page for an event reference, separate from the administrator event view.

#### Scenario: Open payer page
- **WHEN** a visitor opens a valid payer-page link for an event
- **THEN** the page shows the event identity and a Telegram sign-in control without exposing payment data before sign-in

#### Scenario: Unknown event
- **WHEN** a visitor opens a payer-page link for an unknown event reference
- **THEN** the page shows a not-found result and provides no payment form

### Requirement: Payer page requires Telegram authentication but not event administration
The system SHALL require a valid, unexpired Telegram Login session before accepting a payment request, and SHALL not require the signed-in user to be an administrator or member of the event chat.

#### Scenario: Any signed-in user can pay
- **WHEN** a Telegram user successfully signs in and opens an event link they received from any source
- **THEN** the payment form is available regardless of the user's event-chat membership or administrator status

#### Scenario: Unauthenticated submission
- **WHEN** a payment request is submitted without a valid session
- **THEN** the system rejects it as unauthenticated and creates no payment

### Requirement: Payer can create a request for themselves
The system SHALL let a signed-in user enter their payer PayNow mobile number or UEN and an optional display name, then create a pending request using the event's fixed or user-entered payable amount.

#### Scenario: Valid request
- **WHEN** a signed-in user submits a valid payer proxy and optional name for an open event with a default amount, or submits a valid amount when no default exists
- **THEN** one pending payment is created using the event payee and event name, with the signed-in Telegram user as owner

#### Scenario: Invalid input
- **WHEN** the payer proxy or amount is invalid
- **THEN** the page shows a validation error, preserves the entered form values, and creates no payment

### Requirement: Default event amount controls the payable amount

When an event has a configured default amount, the system SHALL use that amount as the payment amount, SHALL show it on the payer page as plain text rather than as a form field, and SHALL not allow the payer to override it. When no default exists, the system SHALL require an editable user-entered amount.

#### Scenario: Default amount present

- **WHEN** a signed-in user opens an open event with a configured default amount
- **THEN** the page shows the amount as plain text with no input control, and the payment uses it

#### Scenario: Client attempts to override default

- **WHEN** a client submits a different amount for an event with a configured default amount
- **THEN** the system ignores or rejects the submitted value and creates no payment with a different amount

#### Scenario: No default amount

- **WHEN** a signed-in user opens an event without a configured default amount
- **THEN** the amount field is empty and the user must enter a valid amount

### Requirement: Closed events refuse new payer requests
The system SHALL reject payer-page payment creation when the event is closed, including when the page was opened before closure.

#### Scenario: Closed event form
- **WHEN** a signed-in user submits a request after the event has closed
- **THEN** the system reports that the event is closed and creates no payment

### Requirement: Created QR is displayed inline
The system SHALL display the newly created payment QR inline on the payer page with the event name, amount, reference, and payer name when supplied, and SHALL never display the payer's PayNow number as text.

#### Scenario: QR result
- **WHEN** a valid payer request is created
- **THEN** the page displays its QR image and payment details immediately without requiring a Telegram message

#### Scenario: QR image request
- **WHEN** the page requests the QR for the payer's newly created payment
- **THEN** the image is served only for that payment and event to the signed-in session

### Requirement: Payer can see their previous requests for the event

The payer page SHALL list the signed-in user's earlier payment requests for the event, newest first, showing amount, status and creation date, and SHALL let the user view the QR of a pending request again. Only the user's own requests SHALL be returned, and no PayNow number SHALL be shown.

#### Scenario: Own history

- **WHEN** a signed-in user who created two requests for the event opens its payer page
- **THEN** both are listed newest first with amount, status and date

#### Scenario: Other users' requests

- **WHEN** other users have requests for the same event
- **THEN** the signed-in user's history does not include them, and the history of another event is not shown

#### Scenario: View a pending QR again

- **WHEN** the user taps a pending request in the list
- **THEN** its QR is shown, served only for that user's own payment

#### Scenario: No history

- **WHEN** the user has no earlier requests for the event
- **THEN** no history section is shown

#### Scenario: Not signed in

- **WHEN** the history is requested without a valid session
- **THEN** the system rejects it as unauthenticated and returns no payments

### Requirement: Payer flow sends a private copy and no group post

After creating a payment request, the system SHALL send the payer a Telegram direct message with the QR photo and the name-only payment caption, without Received or Void buttons, and SHALL NOT post anything to the event chat. Delivery is best-effort: a refusal by Telegram, for example because the payer never started the bot, SHALL NOT fail the request, and the page SHALL show the QR and tell the payer how to receive the copy.

#### Scenario: Privacy-preserving delivery

- **WHEN** a signed-in user creates a request from the payer page
- **THEN** the bot sends that user a private message with the QR and caption, and nothing is posted to the event chat

#### Scenario: Message refused

- **WHEN** Telegram refuses the message
- **THEN** the payment is still created, the QR is shown on the page, and the page says to open the bot and press Start to receive the copy

#### Scenario: No PayNow numbers

- **WHEN** the private message is sent
- **THEN** its caption carries the payer name only, never a PayNow number

### Requirement: Payer page protects submitted requests from cross-site writes
The system SHALL accept payer-page state-changing requests only as same-origin JSON requests with a valid session, and SHALL associate each request with the authenticated Telegram user.

#### Scenario: Cross-origin request
- **WHEN** a request is sent with an origin different from the payer page
- **THEN** the system rejects it and creates no payment

#### Scenario: Ownership attribution
- **WHEN** a signed-in user creates a request
- **THEN** the payment owner is the authenticated Telegram user rather than a client-supplied user id
