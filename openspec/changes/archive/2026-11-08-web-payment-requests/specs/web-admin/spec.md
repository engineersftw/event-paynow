# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
