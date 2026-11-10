## ADDED Requirements

### Requirement: A receipt photo is read for the bill

The system SHALL accept `/split_receipt`, which asks for a photo of the receipt, and SHALL also accept a photo when the bot is asking for the bill total. It SHALL read the photo with a vision model and extract the line items with prices, the service charge, GST, any discount and the total, in SGD. If the photo is unreadable, has no total, or the reader is unavailable, the bot SHALL say so and offer to type the total instead.

#### Scenario: Photo after /split_receipt

- **WHEN** the user sends `/split_receipt` and then a clear receipt photo
- **THEN** the bot shows the numbered items, the charges and the total it read

#### Scenario: Photo instead of a total

- **WHEN** the bot asks for the bill total and the user sends a receipt photo
- **THEN** the photo is read the same way

#### Scenario: Unreadable photo

- **WHEN** the reader finds no total in the photo
- **THEN** the bot says it could not read the receipt and offers Send another photo and Type the total instead

#### Scenario: Reader not available

- **WHEN** receipt reading is not configured
- **THEN** the bot says scanning is not available and continues with a typed total

### Requirement: The user reviews what was read before it is used

The system SHALL show the items, charges and total it read, with Use this, Send another photo and Type the total instead buttons, and SHALL NOT continue until the user chooses. It SHALL warn when the items add up to more than the total, or when a price or total looks invalid. Using the scan SHALL set the bill total to the receipt total.

#### Scenario: Use this

- **WHEN** the user taps Use this
- **THEN** the bill total is the receipt total and the bot asks who had each item

#### Scenario: Items exceed the total

- **WHEN** the items add up to more than the total on the receipt
- **THEN** the review shows a warning that the numbers do not add up

#### Scenario: Type the total instead

- **WHEN** the user taps Type the total instead
- **THEN** the bot asks for the bill total as in a normal split

### Requirement: Items are assigned to people in one message

The system SHALL ask who had each item and accept one message with lines of item numbers followed by people, for example `1,3 Ann`, `2 Ann, Bob`, `4 me`, `5 all`. A person can be a name or an @mention. `me` is the organiser and `all` is everyone named in the message. An item given to several people is shared equally between them. Every item SHALL be assigned exactly once, and a bad or missing line SHALL be named with the whole message asked for again.

#### Scenario: Valid assignment

- **WHEN** the receipt has 5 items and the user sends `1,3 Ann`, `2 Ann, Bob`, `4 me` and `5 all`
- **THEN** the bot accepts the assignment

#### Scenario: Unassigned item

- **WHEN** item 4 appears in no line
- **THEN** the bot says item 4 has nobody and asks for the message again

#### Scenario: Item assigned twice

- **WHEN** item 2 appears in two lines
- **THEN** the bot rejects the message and names item 2

#### Scenario: Unknown item number

- **WHEN** a line names item 9 on a receipt with 5 items
- **THEN** the bot rejects the message and names item 9

### Requirement: Charges are shared in proportion and the amounts add up to the receipt

The system SHALL compute each person's amount as their share of the items plus a share of the difference between the receipt total and the sum of the items (service charge, GST, rounding, and any discount as a negative amount), in proportion to each person's item share, with cents allocated so that all amounts, including the organiser's, add up exactly to the receipt total. The organiser's own amount SHALL be shown but not collected.

#### Scenario: Pro-rata charges

- **WHEN** Ann's items come to 30.00 and Bob's to 10.00, and the receipt total is 48.00 after 8.00 of charges
- **THEN** Ann owes 36.00 and Bob owes 12.00

#### Scenario: Shared item

- **WHEN** a 9.00 item is shared by three people
- **THEN** each person's item share is 3.00 and any odd cent goes to the first people listed

#### Scenario: Organiser's share

- **WHEN** the organiser (`me`) had items worth 20.00 of a 60.00 receipt
- **THEN** the summary shows the organiser covering their share and only the others are asked to pay

### Requirement: The receipt split continues as a custom split

The system SHALL, once items are assigned, continue as a custom split with the computed amounts: the payee question, the optional description, the summary with Confirm, Amend and Cancel, one QR per distinct amount, and direct messages to mentioned people. Amend SHALL offer Items, which asks for the assignment again, and editing the assignment message SHALL update the split like any other edited answer.

#### Scenario: Full receipt flow

- **WHEN** the user scans a receipt, taps Use this, assigns items to `@ann` and `Bob`, gives a payee and confirms
- **THEN** Ann is sent her QR by direct message and the chat receives a QR for Bob

#### Scenario: Amend items

- **WHEN** the user taps Amend, then Items, and sends a new assignment
- **THEN** the summary shows the new amounts

### Requirement: Receipt photos are not kept

The system SHALL process a receipt photo in memory, SHALL NOT store the photo, and SHALL NOT log its contents. The items, prices and assignment SHALL be kept only in the chat's conversation state, which is discarded when the split ends or after 10 minutes.

#### Scenario: Nothing written

- **WHEN** a receipt split is confirmed
- **THEN** no receipt data remains in the database and the conversation state is cleared

#### Scenario: Conversation expires

- **WHEN** a receipt split has been idle for 10 minutes
- **THEN** the scan result and assignment are discarded
