## ADDED Requirements

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

## MODIFIED Requirements

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

## RENAMED Requirements

- FROM: `### Requirement: Payer flow does not send Telegram messages`
- TO: `### Requirement: Payer flow sends a private copy and no group post`
