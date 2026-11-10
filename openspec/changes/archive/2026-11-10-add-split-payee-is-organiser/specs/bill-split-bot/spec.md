## ADDED Requirements

### Requirement: The bot asks whether the payee is the organiser

The system SHALL, after the payee is entered in any split (equal, custom or receipt), ask whether the payee is the organiser, with the buttons "Yes, it's me" and "No, someone else", before the description question. The answer SHALL be kept with the split and SHALL be asked again whenever the payee is changed by amending or editing.

#### Scenario: Question after the payee

- **WHEN** the user enters a valid payee
- **THEN** the bot asks whether the payee is the user, with Yes and No buttons

#### Scenario: Payee changed

- **WHEN** the user amends or edits the payee
- **THEN** the bot asks again whether the new payee is the user

#### Scenario: Only the organiser answers in a group

- **WHEN** a different group member taps a button of that question
- **THEN** nothing changes and they are told the split is not theirs

### Requirement: When someone else is paid, the organiser pays their own share

The system SHALL, when the organiser says the payee is someone else, collect the organiser's own amount like everyone else's and send the organiser a QR for it when it is above zero. When the organiser says the payee is them, their own amount SHALL stay shown but not collected, as before.

#### Scenario: Receipt split, someone else paid

- **WHEN** the organiser's items come to 24.00 of a 72.00 receipt, the payee is someone else, and the split is confirmed
- **THEN** the organiser receives a QR for SGD 24.00 and the others receive theirs

#### Scenario: Custom split, someone else paid

- **WHEN** the bill is 100.00, the list adds up to 80.00, the leftover is left out and the payee is someone else
- **THEN** the organiser receives a QR for SGD 20.00

#### Scenario: Payee is the organiser

- **WHEN** the organiser says the payee is them
- **THEN** their own amount is shown as not collected and no QR is made for it

#### Scenario: Nothing to pay

- **WHEN** the payee is someone else and the organiser's own amount is zero
- **THEN** no QR is made for the organiser

### Requirement: The organiser's own amount comes from their items or the left-out remainder

The system SHALL take the organiser's own amount to be their items and any unassigned items they cover in a receipt split, and the leftover that was left out in a custom split. The organiser's QR SHALL be sent by direct message or, when the bot cannot message them, through a Get my QR button, and SHALL NOT be posted in the chat.

#### Scenario: Via direct message

- **WHEN** the organiser has started the bot and the split is confirmed with someone else as the payee
- **THEN** the QR for their own amount arrives as a direct message

#### Scenario: Not reachable

- **WHEN** the organiser has never started the bot
- **THEN** the chat shows a Get my QR button for them and the QR is not posted in the chat

### Requirement: The summary and QR wording follow the answer

The system SHALL word the summary by the answer. When the payee is the organiser it SHALL say the organiser's own share is not collected, or in an equal split that everyone else pays the share to them. When the payee is someone else it SHALL say the organiser pays their own share and gets a QR, or in an equal split that all the people pay the share to the payee.

#### Scenario: Equal split, someone else paid

- **WHEN** a bill of 100.00 is split between 4 people and the payee is someone else
- **THEN** the summary says all 4 people pay SGD 25.00 to the payee

#### Scenario: Equal split, organiser paid

- **WHEN** a bill of 100.00 is split between 4 people and the payee is the organiser
- **THEN** the summary says everyone else pays the organiser SGD 25.00

## MODIFIED Requirements

### Requirement: Charges are shared in proportion and the amounts add up to the receipt

The system SHALL compute each person's amount as their share of the items plus a share of the difference between the receipt total and the sum of the items (service charge, GST, rounding, and any discount as a negative amount), in proportion to each person's item share, with cents allocated so that all amounts, including the organiser's, add up exactly to the receipt total. The organiser's own amount SHALL be shown, and SHALL be collected only when the payee is someone else.

#### Scenario: Pro-rata charges

- **WHEN** Ann's items come to 30.00 and Bob's to 10.00, and the receipt total is 48.00 after 8.00 of charges
- **THEN** Ann owes 36.00 and Bob owes 12.00

#### Scenario: Shared item

- **WHEN** a 9.00 item is shared by three people
- **THEN** each person's item share is 3.00 and any odd cent goes to the first people listed

#### Scenario: Organiser's share

- **WHEN** the organiser (`me`) had items worth 20.00 of a 60.00 receipt and the payee is the organiser
- **THEN** the summary shows the organiser covering their share and only the others are asked to pay

### Requirement: The organiser chooses what happens to unassigned items

The system SHALL, when an assignment leaves some receipt items out, state which items are unassigned and what they cost before charges, and ask the organiser to choose Split evenly or Leave them out. Split evenly SHALL share each unassigned item equally between everyone named in the assignment. Leave them out SHALL assign each unassigned item to the organiser as part of their own amount. The system SHALL NOT choose for the organiser, and SHALL NOT ask when every item is assigned.

#### Scenario: Split evenly

- **WHEN** item 3 (9.00) is unassigned and the message names Ann and Bob, and the organiser chooses Split evenly
- **THEN** Ann and Bob each carry 4.50 of item 3, plus their share of the charges

#### Scenario: Leave them out

- **WHEN** item 3 is unassigned and the organiser chooses Leave them out
- **THEN** item 3 counts as the organiser's, the summary shows the organiser's share, and only the people named are asked to pay unless the payee is someone else

#### Scenario: Everything assigned

- **WHEN** every item appears in the assignment
- **THEN** the bot does not ask about unassigned items

#### Scenario: The question names the items

- **WHEN** items 2 and 5 are unassigned
- **THEN** the question lists items 2 and 5 and their combined price
