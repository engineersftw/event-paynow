# Spec Delta

## ADDED Requirements

### Requirement: The payment list is loaded in pages

The system SHALL return an event's payments newest first in pages of 20, each with a cursor for the next page, and SHALL return no cursor on the last page. The paybacks returned SHALL be those of the payments on the page. The page SHALL show a "Load more" button while a cursor exists, append the next page to the list when tapped, and hide the button on the last page.

#### Scenario: First page

- **WHEN** an admin opens an event with 45 payments
- **THEN** the 20 newest payments are listed with a "Load more" button

#### Scenario: Load more

- **WHEN** the admin taps "Load more" twice
- **THEN** the remaining 25 payments are appended in order and the button disappears

#### Scenario: No duplicates

- **WHEN** a new payment is created while the admin is on the list and the admin taps "Load more"
- **THEN** no payment appears twice

### Requirement: Admins can search payments by payer or reference

The system SHALL offer a search field that limits the list to payments whose payer name or payment reference contains the entered text, ignoring case, across all payments of the event and not only the loaded ones. It SHALL NOT search or display PayNow numbers. An empty search SHALL show all payments, and a search with no match SHALL say that no payments match.

#### Scenario: Search by name

- **WHEN** the admin types "ali" and the event has a payment from "Alice"
- **THEN** only payments whose payer name or reference contains "ali" are listed

#### Scenario: Search covers unloaded payments

- **WHEN** a matching payment is on the third page and not yet loaded
- **THEN** it is listed after searching without loading more

#### Scenario: No match

- **WHEN** nothing matches the search
- **THEN** the page says no payments match and offers no "Load more"

### Requirement: Admins can filter payments by status

The system SHALL offer a status filter with All, Pending, Received and Voided, defaulting to All, that limits the list to payments of that status across the whole event. The filter and the search SHALL combine, and changing either SHALL restart the list from its first page.

#### Scenario: Pending only

- **WHEN** the admin chooses Pending
- **THEN** only pending payments are listed, newest first, with "Load more" when there are over 20

#### Scenario: Filter and search together

- **WHEN** the admin chooses Received and searches "bob"
- **THEN** only received payments matching "bob" are listed

### Requirement: Event totals ignore search, filter and paging

The system SHALL compute the collected, paid back and pending totals over all payments of the event, so they do not change when the admin searches, filters or loads more. Collected SHALL be the received payments' amounts minus their sent paybacks, paid back SHALL be the total of sent paybacks, and pending SHALL be the amounts of pending payments; voided payments SHALL be excluded.

#### Scenario: Totals while filtering

- **WHEN** the admin filters to Voided
- **THEN** the three totals still show the whole event's figures

### Requirement: List requests are validated

The system SHALL accept a status of pending, received or voided, a search of at most 40 characters and a cursor it issued, and SHALL refuse any other value with an error and no data. Search text SHALL match literally, so `%` and `_` are ordinary characters.

#### Scenario: Unknown status

- **WHEN** the list is requested with status "paid"
- **THEN** the request is refused as invalid

#### Scenario: Wildcard characters

- **WHEN** the search text is `%`
- **THEN** only payments whose payer name or reference contains a literal `%` match

### Requirement: Actions keep the loaded list in place

The system SHALL, after the admin marks a payment received or void or changes a payback, refresh the payments already loaded with the current search and filter, and SHALL NOT scroll the list back to the first page or drop the "Load more" position.

#### Scenario: Mark received on page two

- **WHEN** the admin marks a pending payment received after loading two pages
- **THEN** both pages remain listed with the payment updated and "Load more" still works

## MODIFIED Requirements

### Requirement: Event page lists all payments

The system SHALL list the event's payments from every user in the chat, newest first and in pages, showing for each the payer name when known, amount, status (pending, received or voided), reference, created date, received date, total of its **sent** paybacks, net amount (amount minus sent paybacks), and its paybacks with status and recipient name. The page SHALL NOT display PayNow numbers as text.

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
