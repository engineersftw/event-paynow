# Web Admin Specification

## Purpose

Gives event admins a read-only web page listing every payment of an event, opened from the bot and protected by Telegram sign-in, so they can review an event without paging through chat messages.

## Requirements

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

### Requirement: Event page lists all payments

The system SHALL show, for the event, every payment from every user in the chat, newest first, with description, payer name when known, amount, status (pending, received or voided), reference, created time and received time, together with the collected total, the paid back total and the pending total. For each payment the page SHALL also show the total of its **sent** paybacks and its net amount (amount minus sent paybacks), and the payment's paybacks with status and recipient name. The collected total SHALL be the received payments' amounts minus their sent paybacks, the paid back total SHALL be the total of sent paybacks, and the pending total SHALL be the amounts of pending payments; pending and cancelled paybacks SHALL NOT reduce any figure. Voided payments SHALL be listed but excluded from the totals. The page SHALL NOT display PayNow numbers as text.

#### Scenario: Payments and totals

- **WHEN** an authorised admin opens an event with 3 received, 2 pending and 1 voided payment, and no paybacks
- **THEN** all 6 are listed with their statuses and the totals count only the received and pending ones, with $0.00 paid back

#### Scenario: Sent payback reduces the net amount and collected total

- **WHEN** an authorised admin opens an event with a received payment of 2000 that has a sent payback of 500
- **THEN** that payment shows $5.00 paid back and a $15.00 net amount, and the totals show $15.00 collected and $5.00 paid back

#### Scenario: Pending and cancelled paybacks are ignored

- **WHEN** a received payment of 2000 has a pending payback of 500 and a cancelled payback of 300
- **THEN** the page shows $0.00 paid back and a $20.00 net amount for it

#### Scenario: Event without payments

- **WHEN** an authorised admin opens an event with no payments
- **THEN** the page says there are no payments yet, with zero totals

#### Scenario: Read only

- **WHEN** an admin uses the page
- **THEN** it offers only creating payment requests, marking pending payments received or voided, and the payback actions, and no other way to change data

### Requirement: Admins can create a payback from the event page

The system SHALL let an authorised admin create a payback for any **received** payment of the event from the page, with an amount (default: the remaining payable amount) and a recipient. The recipient defaults to the payment's stored payer; a different mobile number or UEN MAY be entered and applies to that payback only; a payment with no stored payer REQUIRES one.

#### Scenario: Payback to the stored payer

- **WHEN** an admin pays back 500 on a received payment of 2000 whose payer is stored, leaving the recipient at its default
- **THEN** a pending payback of $5.00 to that payer is recorded

#### Scenario: Different recipient

- **WHEN** the admin enters another valid mobile number as the recipient
- **THEN** the payback is made to that number, and the payment's stored payer is unchanged

#### Scenario: Payment without a stored payer

- **WHEN** the admin pays back a legacy payment that has no stored payer and enters no recipient
- **THEN** the request is refused and the page asks for a recipient

#### Scenario: Not a received payment

- **WHEN** a payback is requested for a pending or voided payment
- **THEN** the request is refused and nothing is recorded

#### Scenario: Payment of another event

- **WHEN** a payback is requested through an event page for a payment that belongs to a different event
- **THEN** the request is refused as not found

### Requirement: Web paybacks follow the bot's validation and bound

The system SHALL validate a payback created from the page exactly as the bot does: the amount is positive with at most two decimals, the recipient is a valid mobile number or UEN, and the amount does not exceed the remaining payable amount, where pending and sent paybacks count and cancelled ones do not. A payback that would exceed the bound SHALL be refused and nothing recorded, even when requests race.

#### Scenario: Over the bound

- **WHEN** the admin enters an amount larger than the remaining payable amount
- **THEN** the request is refused with the remaining amount and no payback is recorded

#### Scenario: Invalid input

- **WHEN** the amount has more than two decimals or the recipient is not a valid mobile number or UEN
- **THEN** the request is refused with an explanation and nothing is recorded

#### Scenario: Racing requests

- **WHEN** two paybacks that together exceed the remaining amount are submitted at the same time
- **THEN** at most one is recorded

### Requirement: A created payback shows its QR image

The system SHALL show the payback QR image for each pending payback on the page, with the payback details printed below the QR (original payment reference, amount, payback reference, and the recipient's name when known; never the recipient's number as text), and SHALL serve the image only to an authorised admin of the payback's event.

#### Scenario: QR after creating

- **WHEN** a payback is created successfully
- **THEN** its QR image is shown, encoding the payback payable to the recipient

### Requirement: Admins can mark a payback sent or cancel it from the event page

The system SHALL let an authorised admin mark a **pending** payback of the event as sent, or cancel it, from the page. Each transition SHALL apply only while the payback is still pending, so racing or repeated requests have exactly one winner and the others are told the payback is no longer pending. Cancelling SHALL release the payback's amount for further paybacks; marking sent SHALL reduce the payment's net amount and the event totals.

#### Scenario: Mark sent

- **WHEN** an admin marks a pending payback of 500 as sent
- **THEN** it becomes sent, the payment's net amount drops by $5.00 and the paid back total rises by $5.00

#### Scenario: Cancel

- **WHEN** an admin cancels a pending payback
- **THEN** it becomes cancelled, no figure changes, and its amount can be paid back again

#### Scenario: Already handled

- **WHEN** an admin marks sent or cancels a payback that is no longer pending
- **THEN** the request is refused with a message that the payback is already sent or cancelled

### Requirement: Payback requests are authenticated and same-origin

The system SHALL accept payback creation and status changes only from a signed-in user who is, at that moment, an administrator or owner of the event's chat (or the owner of a private chat), SHALL reject requests that are not same-origin, and SHALL serve a payback QR image only to such a user for a payback that belongs to the requested event.

#### Scenario: Not signed in

- **WHEN** a payback request arrives without a valid session
- **THEN** it is refused as unauthenticated and nothing is recorded

#### Scenario: Signed in but not an admin

- **WHEN** a signed-in user who is not a chat administrator submits a payback request
- **THEN** it is refused as forbidden and nothing is recorded

#### Scenario: Cross-site request

- **WHEN** a payback request carries a different Origin than the page's own
- **THEN** it is refused and nothing is recorded

#### Scenario: QR of another event's payback

- **WHEN** a signed-in admin requests the QR image of a payback that belongs to a different event
- **THEN** it is refused as not found

### Requirement: Web actions are attributed to the admin who performed them

The system SHALL record the signed-in admin's Telegram user id as the creator of a payback created from the page and as the user who marked a payback sent or cancelled it, in the same step that applies the action.

#### Scenario: Attribution

- **WHEN** an admin creates a payback and another admin marks it sent from the page
- **THEN** the payback records the first admin as creator and the second as the user who marked it sent

### Requirement: Admins can create a payment request from the event page

The system SHALL let an authorised admin create a payment request for an **open** event from the page, with the payer's PayNow mobile number or UEN (required), the payer's display name (optional) and an amount. The request SHALL be recorded as pending with the event's payee and the event name as description, and the signed-in admin SHALL be its owner.

#### Scenario: Create a request

- **WHEN** an admin submits payer `91234567`, name "Alice" and amount 12.50 for an open event
- **THEN** a pending payment of $12.50 for payer +6591234567 named Alice is recorded, owned by that admin

#### Scenario: Name is optional

- **WHEN** the admin leaves the name empty
- **THEN** the request is created without a payer name

### Requirement: Web payment requests follow the bot's validation

The system SHALL validate a payment request created from the page like `/start`: the payer is a valid mobile number or UEN, the amount is positive with at most two decimals, and the event is open. A request that fails validation, or targets a closed or unknown event, SHALL be refused and nothing recorded.

#### Scenario: Invalid input

- **WHEN** the payer is not a valid mobile number or UEN, or the amount has more than two decimals or is not positive
- **THEN** the request is refused with an explanation and nothing is recorded

#### Scenario: Closed event

- **WHEN** the admin submits a request for a closed event
- **THEN** it is refused and nothing is recorded

### Requirement: A created payment request shows its QR and is posted to the chat

The system SHALL show the new payment's QR image on the page, with the payment details printed below the QR (description, amount, reference, and the payer's name when known; never the payer's number as text), and SHALL post the QR photo to the event's Telegram chat, in the event's topic, with the same caption as `/start` and ✓ Received / ✖ Void buttons. If posting to the chat fails, the payment SHALL remain recorded and the page SHALL say it could not be posted.

#### Scenario: QR on the page and in the chat

- **WHEN** a payment request is created from the page
- **THEN** the page shows its QR image and the event's chat receives the QR photo with the caption and buttons

#### Scenario: Posting to the chat fails

- **WHEN** the bot cannot post to the event's chat
- **THEN** the payment stays recorded, the QR is still shown on the page, and the page says it was not posted to the chat

### Requirement: Admins can mark a pending payment received or void it from the event page

The system SHALL let an authorised admin mark a **pending** payment of the event received, or void it, from the page. Each transition SHALL apply only while the payment is still pending, so racing or repeated requests, including ones made from Telegram, have exactly one winner and the others are told the payment is no longer pending. A payment that has been marked received or voided SHALL no longer offer these actions.

#### Scenario: Mark received

- **WHEN** an admin marks a pending payment received
- **THEN** it becomes received, counts toward collected instead of pending, and offers the payback action

#### Scenario: Void

- **WHEN** an admin voids a pending payment
- **THEN** it becomes voided and is excluded from the totals

#### Scenario: Already settled

- **WHEN** an admin marks received or voids a payment that is no longer pending
- **THEN** the request is refused with a message that the payment is already received or voided

### Requirement: Payment requests and status changes carry the same safeguards

The system SHALL accept payment request creation, marking received and voiding only from a signed-in user who is, at that moment, an administrator or owner of the event's chat (or the owner of a private chat), SHALL reject requests that are not same-origin JSON, SHALL record the acting admin in the audit columns, and SHALL serve a payment QR image only to such a user for a payment that belongs to the requested event.

#### Scenario: Not signed in or not an admin

- **WHEN** a request arrives without a valid session, or from a user who is not a chat administrator
- **THEN** it is refused (unauthenticated or forbidden) and nothing is recorded

#### Scenario: Cross-site request

- **WHEN** a request carries a different Origin than the page's own
- **THEN** it is refused and nothing is recorded

#### Scenario: Attribution

- **WHEN** one admin creates a request and another marks it received
- **THEN** the second admin is recorded as the user who marked it received

#### Scenario: QR of another event's payment

- **WHEN** an admin requests the QR image of a payment that belongs to a different event
- **THEN** it is refused as not found
