# Spec Delta

## MODIFIED Requirements

### Requirement: Event page lists all payments, read only

The system SHALL show, for the event, every payment from every user in the chat, newest first, with description, payer name when known, amount, status (pending, received or voided), reference, created time and received time, together with the collected total, the paid back total and the pending total. For each payment the page SHALL also show the total of its **sent** paybacks and its net amount (amount minus sent paybacks). The collected total SHALL be the received payments' amounts minus their sent paybacks, the paid back total SHALL be the total of sent paybacks, and the pending total SHALL be the amounts of pending payments; pending and cancelled paybacks SHALL NOT reduce any figure. Voided payments SHALL be listed but excluded from the totals. The page SHALL NOT offer any way to change data, and SHALL NOT display PayNow numbers.

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
- **THEN** it offers no actions that create, receive, void or pay back a payment
