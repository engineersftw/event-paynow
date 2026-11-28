# Spec Delta

## MODIFIED Requirements

### Requirement: The review says how much looks missing

The system SHALL show any positive difference between the receipt total and the sum of the items and identified charges less discounts, and SHALL offer an Add a missing item button. It SHALL NOT offer that button when there is no positive difference.

#### Scenario: Missing amount shown

- **WHEN** the items add up to 107.60, the subtotal is 117.10, identified charges are 23.30 and the total is 140.40
- **THEN** the review says SGD 9.50 looks missing and offers Add a missing item

#### Scenario: No subtotal read

- **WHEN** no subtotal was read, the total is 140.40, the service charge 11.71 and GST 11.59, and the items add up to 107.60
- **THEN** the review works out that SGD 9.50 looks missing

#### Scenario: Everything adds up

- **WHEN** the items and identified adjustments add up to the total
- **THEN** the review shows no missing amount and no Add a missing item button

#### Scenario: Too much instead

- **WHEN** the items and identified adjustments add up to more than the total
- **THEN** the review warns that the numbers do not add up and does not offer Add a missing item

### Requirement: The user reviews what was read before it is used

The system SHALL show the items, charges and total it read, with Send another photo and Type the total instead buttons, and correction controls for discrepancies. It SHALL offer Use this only when the receipt is reconciled and SHALL NOT continue until the user chooses. It SHALL warn when the items add up to more than the total, or when a price or total looks invalid. Using the scan SHALL set the bill total to the receipt total.

#### Scenario: Use this

- **WHEN** the user taps Use this for a reconciled receipt in a private chat
- **THEN** the bill total is the receipt total and the bot asks who had each item

#### Scenario: Use this in a group

- **WHEN** the user taps Use this for a reconciled receipt in a group chat
- **THEN** the bill total is the receipt total and the bot asks whether to type the assignment or let everyone claim

#### Scenario: Items exceed the total

- **WHEN** the items add up to more than the total on the receipt
- **THEN** the review shows a warning that the numbers do not add up

#### Scenario: Type the total instead

- **WHEN** the user taps Type the total instead
- **THEN** the bot asks for the bill total as in a normal split

#### Scenario: Added items are used

- **WHEN** the user added a missing item and then taps Use this after reconciling the receipt
- **THEN** the added item is part of the items the bot asks who had

### Requirement: Charges are shared in proportion and every share is rounded up to the cent

The system SHALL compute each person's amount as their share of the items plus their proportional share of the identified charges and discounts on the reconciled receipt, and round each person's amount UP to the next whole cent, so nobody pays less than their exact share and the amounts, including the organiser's, MAY add up to a few cents more than the receipt total. The summary SHALL show, beside every amount that was rounded up, the unrounded amount to three decimals (for example `SGD 26.98 (rounded up from SGD 26.976)`), and SHALL say how many cents over the receipt total the amounts add up to. The organiser's own amount SHALL be shown, and SHALL be collected only when the payee is someone else. The amounts SHALL NOT depend on the order in which the people are named.

#### Scenario: Pro-rata charges

- **WHEN** Ann's items come to 30.00 and Bob's to 10.00, and the receipt total is 48.00 after 8.00 of identified charges
- **THEN** Ann owes 36.00 and Bob owes 12.00

#### Scenario: Shared item

- **WHEN** a 10.00 item is shared by three people and the receipt total equals the items
- **THEN** each person owes 3.34 and the summary shows `SGD 3.34 (rounded up from SGD 3.333)` for each

#### Scenario: Rounded up, a few cents over

- **WHEN** the receipt total is 68.34 for items of 57.00 and identified charges of 11.34, Ash had items worth 12.00 and Dylan and the organiser 22.50 each
- **THEN** Ash owes 14.39 (rounded up from 14.387), Dylan and the organiser 26.98 each (rounded up from 26.976), and the summary says the amounts add up to 68.35, 0.01 over

#### Scenario: Same items, same amount

- **WHEN** two people have the same items, whichever of them is named first
- **THEN** they owe the same amount

#### Scenario: Organiser's share

- **WHEN** the organiser (`me`) had items worth 20.00 of a 60.00 receipt and the payee is the organiser
- **THEN** the summary shows the organiser covering their share and only the others are asked to pay

### Requirement: Claims become the same amounts as a typed assignment

The system SHALL compute each claimer's amount exactly as for a typed assignment: each item shared equally between its claimers (an item shared N ways costs each holder one Nth, and unfilled shares are handled as unclaimed items), identified charges and discounts shared in proportion, each rounded up to the cent, so they may add up to a few cents more than the receipt total. The split SHALL then continue as a custom split with the claimers as the people to collect from.

#### Scenario: Claimed amounts

- **WHEN** Ann claims a 30.00 item, Bob a 10.00 item, and the receipt total is 48.00 including 8.00 of identified charges
- **THEN** Ann owes 36.00 and Bob owes 12.00

#### Scenario: Item shared three ways

- **WHEN** a 30.00 item is shared 3 ways, Ann and Bob hold a share each, and the organiser covers the unfilled share
- **THEN** Ann and Bob each owe 10.00 for it and the organiser's own share includes the other 10.00

### Requirement: A member can get their own QR in the chat before the claiming is closed

The system SHALL show a Get my QR button on the claim message. When a member who holds at least one item taps it, the system SHALL send them a PayNow QR for their own amount to the payee already given, without waiting for the organiser's Done. The amount SHALL be the member's items (each item split equally between its holders) plus their proportional share of identified charges and discounts, calculated from the receipt's total of all items so that it does not depend on what other members claim, and rounded up to the cent. The QR SHALL be posted in the chat in the background shortly after the tap, with the member's name on the image and caption, and SHALL NOT be sent by direct message; the member's amount SHALL be fixed at the tap. When the QR cannot be posted after retrying, the chat SHALL be told that the member's QR was not sent. A member who holds nothing SHALL be told to claim an item first. The QR SHALL carry the split's description, which is settled before the claiming begins.

#### Scenario: Member takes their QR early

- **WHEN** Ann holds item 1 and taps Get my QR while other items are unclaimed
- **THEN** a QR for her amount is posted in the chat with her name on it and claiming stays open

#### Scenario: Member never started the bot

- **WHEN** Bob has never started the bot and taps Get my QR
- **THEN** his QR is posted in the chat like anyone else's

#### Scenario: Nothing claimed

- **WHEN** a member who holds no item taps Get my QR
- **THEN** they are told to claim an item first

#### Scenario: Member without a Telegram account

- **WHEN** the organiser typed a name for a person who has no Telegram account
- **THEN** that person has no way to take a QR and is served by the shared chat QR when the claiming is closed

#### Scenario: Description included

- **WHEN** the description was settled as `Huevos` before the claiming and a member taps Get my QR
- **THEN** the QR carries the description `Huevos`

## ADDED Requirements

### Requirement: Receipt differences are reconciled before splitting

The system SHALL allocate only identified charges and discounts and SHALL require the organiser to reconcile any unexplained difference between items, identified adjustments and the receipt total before proceeding to assignment or claiming. It SHALL NOT infer GST or service charge from a difference.

#### Scenario: No charges
- **WHEN** the receipt shows GST of zero, no service charge, and item totals match the total
- **THEN** each person's share uses only their items, with no GST or service charge added

#### Scenario: Missing items or modifiers
- **WHEN** items plus identified adjustments do not match the receipt total
- **THEN** the review explains the difference and lets the organiser correct it before continuing

#### Scenario: Identified charges
- **WHEN** a receipt has explicit nonzero GST or service charge and reconciles
- **THEN** those charges are shared proportionally to item shares

#### Scenario: Consistent claim amounts
- **WHEN** the same reconciled receipt is split by typed assignment, claims, or an early QR
- **THEN** each uses the same allocation and cent-rounding rules
