# Event Payment Page Specification

## Purpose

Provides a public, payer-facing event page where anyone with the event link can authenticate with Telegram, create a payment request for themselves, and receive the payment QR inline without relying on Telegram message delivery.

## Requirements

### Requirement: Payer page is available from an event link
The system SHALL provide a distinct payer-facing page for an event reference, separate from the administrator event view.

#### Scenario: Open payer page
- **WHEN** a visitor opens a valid payer-page link for an event
- **THEN** the page shows the event identity and the payment form without requiring sign-in, plus an optional Telegram sign-in control, and shows no existing payment data

#### Scenario: Unknown event
- **WHEN** a visitor opens a payer-page link for an unknown event reference
- **THEN** the page shows a not-found result and provides no payment form

### Requirement: Payer page does not require sign-in or event administration
The system SHALL accept payment requests from visitors with or without a valid Telegram Login session, and SHALL not require anyone to be an administrator or member of the event chat. Telegram sign-in SHALL stay available as an option.

#### Scenario: Any signed-in user can pay
- **WHEN** a Telegram user signs in from the page
- **THEN** the form stays available regardless of the user's event-chat membership or administrator status

#### Scenario: Unauthenticated submission
- **WHEN** a payment request is submitted without a valid session
- **THEN** the system accepts it and creates the payment without a Telegram owner

#### Scenario: Expired session
- **WHEN** a request carries an invalid or expired session
- **THEN** it is treated as anonymous rather than rejected

### Requirement: Payer can create a request for themselves
The system SHALL let any visitor, signed in or not, enter their payer PayNow mobile number or UEN and an optional display name, then create a pending request using the event's fixed or user-entered payable amount.

#### Scenario: Valid request
- **WHEN** a visitor submits a valid payer proxy and optional name for an open event with a default amount, or submits a valid amount when no default exists
- **THEN** one pending payment is created using the event payee and event name

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
- **WHEN** a valid payer request is created, signed in or not
- **THEN** the page displays its QR image and payment details immediately, delivered in the creation response

#### Scenario: QR image request
- **WHEN** a signed-in user requests the QR of one of their earlier payments
- **THEN** the image is served only for that payment and event to its owner's session

### Requirement: Payer can see their previous requests for the event

The payer page SHALL list a signed-in user's earlier payment requests for the event, newest first, showing amount, status and creation date, and SHALL let the user view the QR of a pending request again. Only that user's own requests SHALL be returned, no PayNow number SHALL be shown, and visitors who are not signed in SHALL see no list.

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
- **THEN** the system rejects it as unauthenticated and returns no payments, and the page shows no history section

### Requirement: Payer flow sends a private copy and no group post

After a signed-in user creates a payment request, the system SHALL send them a Telegram direct message with the QR photo and the name-only caption, without Received or Void buttons, and SHALL NOT post anything to the event chat. Visitors who are not signed in get no Telegram message. Delivery is best-effort: a refusal by Telegram SHALL NOT fail the request, and the page SHALL show the QR and tell the user how to receive the copy.

#### Scenario: Privacy-preserving delivery

- **WHEN** a signed-in user creates a request from the payer page
- **THEN** the bot sends that user a private message with the QR and caption, and nothing is posted to the event chat

#### Scenario: Message refused

- **WHEN** Telegram refuses the message
- **THEN** the payment is still created, the QR is shown on the page, and the page says to open the bot and press Start to receive the copy

#### Scenario: No PayNow numbers

- **WHEN** the private message is sent
- **THEN** its caption carries the payer name only, never a PayNow number

#### Scenario: Not signed in

- **WHEN** a visitor who is not signed in creates a request
- **THEN** no Telegram message is attempted and nothing is posted to the event chat

### Requirement: Payer page protects submitted requests from cross-site writes
The system SHALL accept payer-page state-changing requests only as same-origin JSON requests, and SHALL attribute each request to the authenticated Telegram user when a valid session is present and to no user otherwise.

#### Scenario: Cross-origin request
- **WHEN** a request is sent with an origin different from the payer page
- **THEN** the system rejects it and creates no payment

#### Scenario: Ownership attribution
- **WHEN** a signed-in user creates a request
- **THEN** the payment owner is the authenticated Telegram user rather than a client-supplied user id

#### Scenario: Anonymous ownership
- **WHEN** a visitor who is not signed in creates a request
- **THEN** the payment is recorded with no Telegram owner, and event administrators can view and settle it like any other request

### Requirement: Anonymous request creation is rate limited

The system SHALL refuse anonymous payment creation for an event once 30 anonymous requests were created for it in the last 10 minutes, answering that the page is busy, and SHALL NOT limit signed-in users by this cap.

#### Scenario: Cap reached

- **WHEN** 30 anonymous requests exist for the event from the last 10 minutes and another visitor submits one
- **THEN** the system rejects it as rate limited and creates no payment

#### Scenario: Signed-in users unaffected

- **WHEN** the anonymous cap is reached and a signed-in user submits a valid request
- **THEN** the request is created

#### Scenario: Window passes

- **WHEN** the earlier anonymous requests are older than 10 minutes
- **THEN** a new anonymous request is accepted

### Requirement: Payer page shows the signed-in user and offers sign out

When a user is signed in, the payer page SHALL show their name in the header with a Sign out control. Signing out SHALL end the session in that browser and return the page to the anonymous form, without the user's history or private-copy behaviour.

#### Scenario: Name shown

- **WHEN** a signed-in user opens the payer page
- **THEN** the header shows their Telegram name and a Sign out button

#### Scenario: Sign out

- **WHEN** the user taps Sign out
- **THEN** the session is cleared, the page reloads as an anonymous visitor with the form and the optional sign-in block, and the user's earlier requests are no longer listed

#### Scenario: Anonymous visitor

- **WHEN** a visitor is not signed in
- **THEN** no user name or Sign out control is shown

### Requirement: Payer page reminds the payer to keep the QR

Wherever the payer page shows a payment QR (right after creating a request and when a pending request is opened from the history), it SHALL show the reminder "Keep this QR for event check-in and payment verification" next to the QR, as text.

#### Scenario: After creating a request

- **WHEN** a visitor creates a request and the QR is displayed
- **THEN** the reminder is shown with the QR

#### Scenario: Reopening a pending request

- **WHEN** a signed-in user opens a pending request's QR from the history
- **THEN** the reminder is shown with that QR

### Requirement: The payment page links to the event website

The payment page SHALL show a link to the event's website under the page title when the event has one, displayed as the address's host name, opening in a new tab with `rel="noopener noreferrer nofollow"`, for signed-in and anonymous visitors alike. When the event has no website, nothing SHALL be shown for it.

#### Scenario: Event with a website

- **WHEN** a visitor opens the payment page for an event whose website is `https://www.example.com/dinner`
- **THEN** a link labelled `www.example.com` appears under the title and opens the full address in a new tab

#### Scenario: Event without a website

- **WHEN** a visitor opens the payment page for an event with no website
- **THEN** no website link is shown

#### Scenario: Closed event

- **WHEN** the event is closed
- **THEN** the page still shows the website link beside the closed notice

#### Scenario: Only web addresses become links

- **WHEN** the stored value is not an `http` or `https` address
- **THEN** it is not turned into a link
