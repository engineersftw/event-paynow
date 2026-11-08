# Spec Delta

## Purpose
Gives event admins a read-only web page listing every payment of an event, opened from the bot and protected by Telegram sign-in, so they can review an event without paging through chat messages.

## ADDED Requirements

### Requirement: /web_admin opens an event page link

The system SHALL provide a `/web_admin` command that lists the events of the current chat and topic and offers a link button for each one that opens that event's web page.

#### Scenario: Chat with events

- **WHEN** a user sends `/web_admin` in a chat that has events
- **THEN** the bot replies with each event's name and a button linking to that event's page

#### Scenario: Chat without events

- **WHEN** a user sends `/web_admin` in a chat that has no events
- **THEN** the bot replies that there are no events yet and suggests `/init`

### Requirement: Event page requires Telegram sign-in

The system SHALL require the visitor to sign in with Telegram before showing any event data, and SHALL verify the sign-in data against the bot's credentials, rejecting data that is invalid or older than a day. A successful sign-in SHALL keep the visitor signed in for a limited time.

#### Scenario: Not signed in

- **WHEN** a visitor opens an event page without a valid session
- **THEN** the page shows only the Telegram sign-in and no event data

#### Scenario: Forged or stale sign-in data

- **WHEN** sign-in data fails verification or is older than a day
- **THEN** the visitor is not signed in and sees an error

### Requirement: Only chat admins can view an event

The system SHALL show an event's data only to a signed-in user who is an administrator or the owner of the event's Telegram chat, or the user themself when the event belongs to a private chat. Any other user SHALL see a "not allowed" message and no event data.

#### Scenario: Chat administrator

- **WHEN** a signed-in chat administrator opens the page of an event in that chat
- **THEN** the event page is shown

#### Scenario: Ordinary member or outsider

- **WHEN** a signed-in user who is not an administrator of the event's chat opens the page
- **THEN** a "not allowed" message is shown and no payment data is returned

#### Scenario: Unknown event

- **WHEN** a visitor opens a page for an event reference that does not exist
- **THEN** a "not found" message is shown

### Requirement: Event page lists all payments, read only

The system SHALL show, for the event, every payment from every user in the chat, newest first, with description, payer name when known, amount, status (pending, received or voided), reference, created time and received time, together with the collected total (received payments) and the pending total (pending payments). Voided payments SHALL be listed but excluded from the totals. The page SHALL NOT offer any way to change data, and SHALL NOT display PayNow numbers.

#### Scenario: Payments and totals

- **WHEN** an authorised admin opens an event with 3 received, 2 pending and 1 voided payment
- **THEN** all 6 are listed with their statuses and the totals count only the received and pending ones

#### Scenario: Event without payments

- **WHEN** an authorised admin opens an event with no payments
- **THEN** the page says there are no payments yet, with zero totals

#### Scenario: Read only

- **WHEN** an admin uses the page
- **THEN** it offers no actions that create, receive, void or pay back a payment
