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
When an event has a configured default amount, the system SHALL use that amount as the payment amount and SHALL not allow the payer to edit or override it. When no default exists, the system SHALL require an editable user-entered amount.

#### Scenario: Default amount present
- **WHEN** a signed-in user opens an open event with a configured default amount
- **THEN** the amount field displays that amount as read-only or disabled and the payment uses it

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

### Requirement: Payer flow does not send Telegram messages
The payer-facing creation flow SHALL not call Telegram to send or post the payment QR, and a successful database creation SHALL remain successful even though no Telegram message is sent.

#### Scenario: Privacy-preserving delivery
- **WHEN** a signed-in user creates a payment request from the payer page
- **THEN** the QR is delivered in the webpage response and no Telegram direct message or event-chat post is attempted

### Requirement: Payer page protects submitted requests from cross-site writes
The system SHALL accept payer-page state-changing requests only as same-origin JSON requests with a valid session, and SHALL associate each request with the authenticated Telegram user.

#### Scenario: Cross-origin request
- **WHEN** a request is sent with an origin different from the payer page
- **THEN** the system rejects it and creates no payment

#### Scenario: Ownership attribution
- **WHEN** a signed-in user creates a request
- **THEN** the payment owner is the authenticated Telegram user rather than a client-supplied user id
