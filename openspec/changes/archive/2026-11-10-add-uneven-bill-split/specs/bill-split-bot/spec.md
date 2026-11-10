## ADDED Requirements

### Requirement: The user chooses between an equal and a custom split

The system SHALL, after the bill total is accepted, ask whether to split the bill Equally or with Custom amounts, using two buttons. Choosing Equally SHALL continue with the number-of-people question exactly as before. Choosing Custom amounts SHALL continue with the list of people and amounts.

#### Scenario: Choosing equal

- **WHEN** the user taps Equally
- **THEN** the bot asks how many people share the bill

#### Scenario: Choosing custom

- **WHEN** the user taps Custom amounts
- **THEN** the bot asks for a list with one person per line as a name followed by an amount

### Requirement: `/split_custom` starts a custom split directly

The system SHALL accept `/split_custom` as a shortcut that asks for the bill total and then goes straight to the custom list, without asking Equally or Custom amounts. After that it SHALL behave exactly as a custom split started from `/split`, in private chats and in groups, with the same owner-only rules in groups.

#### Scenario: Shortcut skips the choice

- **WHEN** the user sends `/split_custom` and then a valid total
- **THEN** the bot asks for the list of names and amounts and does not offer Equally or Custom amounts

#### Scenario: Invalid total

- **WHEN** the total after `/split_custom` is not a positive amount with at most two decimals
- **THEN** the bot explains the format and asks for the total again

#### Scenario: Restarting replaces a split in progress

- **WHEN** the owner sends `/split_custom` while a split of theirs is waiting for an answer
- **THEN** the earlier answers are discarded and the bot asks for the total again

### Requirement: A custom split takes a list of names and amounts

The system SHALL accept the custom list as one message with one person per line, each line a name followed by an amount in SGD (for example `Ann 40`), for 1 to 20 people who pay the organiser. The organiser is not listed. If any line is invalid, the system SHALL name the first bad line and ask for the whole list again.

#### Scenario: Valid list

- **WHEN** the bill is 100.00 and the user sends the lines `Ann 40` and `Bob 25.50`
- **THEN** the bot accepts the list of two people

#### Scenario: Bad line

- **WHEN** a line has no amount, a name longer than 20 characters, no name, or an amount that is zero, negative or has more than two decimals
- **THEN** the bot names that line, explains the format and asks for the list again

#### Scenario: Duplicate name

- **WHEN** the list contains `Ann 10` and `ann 20`
- **THEN** the bot rejects the list because the name is repeated

#### Scenario: Too many people

- **WHEN** the list has more than 20 lines
- **THEN** the bot says the limit is 20 people and asks again

### Requirement: The custom list is checked against the bill total

The system SHALL compare the sum of the listed amounts with the bill total. A sum above the total SHALL be rejected, telling the user by how much it is over, and the list asked for again. A sum equal to the total SHALL continue to the payee question. A sum below the total SHALL ask what to do with the leftover, with two buttons: Split it evenly between the people listed, or Leave it out.

#### Scenario: Over the bill

- **WHEN** the bill is 100.00 and the list adds up to 110.00
- **THEN** the bot says the list is SGD 10.00 over the bill and asks for the list again

#### Scenario: Exactly the bill

- **WHEN** the bill is 100.00 and the list adds up to 100.00
- **THEN** the bot does not ask about a leftover and asks for the payee

#### Scenario: Leftover left out

- **WHEN** the bill is 100.00, the list adds up to 80.00 and the user taps Leave it out
- **THEN** every person keeps the amount listed and the organiser covers SGD 20.00

#### Scenario: Leftover split evenly

- **WHEN** the bill is 100.00, the list is `Ann 40` and `Bob 40`, and the user taps Split it evenly
- **THEN** each of the two people owes SGD 10.00 more, so Ann and Bob each owe SGD 50.00

#### Scenario: Leftover split evenly with rounding

- **WHEN** the leftover is SGD 10.00 and 3 people are listed
- **THEN** each person is charged SGD 3.34 of it, and the summary shows that the amounts add up to SGD 0.02 more than the bill

## MODIFIED Requirements

### Requirement: The bot asks for the bill, the number of people, the payee and a description

The system SHALL, when a user sends `/split` to Split_PayNow_Bot (or `/start` in a private chat), ask in order for the bill total in SGD, whether to split Equally or with Custom amounts, then either the number of people (equal split) or the list of names and amounts (custom split), then the payee (a Singapore mobile number or a UEN) and an optional short description. The total, the split details and the payee are required. The description SHALL offer a Skip button and SHALL be at most 25 characters. The bot SHALL work in private chats and in group chats.

#### Scenario: Full conversation in a private chat

- **WHEN** the user sends `/split`, the total `187.40`, taps Equally, sends the number `4`, a valid payee and the description `Dinner`, and then confirms
- **THEN** the bot replies with a PayNow QR image for one share of the bill

#### Scenario: Skipping the description

- **WHEN** the user taps Skip on the description question and confirms
- **THEN** the QR is sent without a description

#### Scenario: Invalid total

- **WHEN** the total is not a positive amount with at most two decimals
- **THEN** the bot explains the format and asks for the total again, without moving on

#### Scenario: Invalid number of people

- **WHEN** the number of people is not a whole number from 2 to 100, or is larger than the number of cents in the total
- **THEN** the bot says what is allowed and asks again

#### Scenario: Invalid payee

- **WHEN** the payee is not a valid mobile number or UEN
- **THEN** the bot explains the accepted formats and asks again

#### Scenario: Full custom conversation

- **WHEN** the user sends `/split`, the total `100`, taps Custom amounts, sends the lines `Ann 60` and `Bob 40`, a valid payee and taps Skip, and then confirms
- **THEN** the bot replies with PayNow QR images for the amounts listed

### Requirement: The bot confirms before it generates the QR

The system SHALL, after the last question, show one summary with Confirm and Cancel buttons, and SHALL NOT generate any QR until the user confirms. For a custom split the summary SHALL list each person with the amount they owe, say how a leftover was handled, and show any amount collected above the bill because of rounding. In a private chat the summary shows the payee type and number. In a group chat the summary SHALL show only the payee type and the last four characters of the payee, never the full number.

#### Scenario: Summary in a private chat

- **WHEN** the user has answered every question in a private chat
- **THEN** the bot shows the payee, total, number of people, share and description, and no QR has been sent yet

#### Scenario: Summary in a group

- **WHEN** the user has answered every question in a group chat
- **THEN** the summary hides all but the last four characters of the payee

#### Scenario: Custom summary

- **WHEN** the user has answered every question of a custom split with a leftover left out
- **THEN** the summary lists each person's amount, says the leftover is left out and who covers it, and no QR has been sent yet

#### Scenario: Confirm

- **WHEN** the user taps Confirm
- **THEN** the buttons are removed from the summary and the QR is sent exactly once, even if the button is tapped twice

#### Scenario: Cancel

- **WHEN** the user taps Cancel
- **THEN** nothing is generated, the conversation is cleared and the user is told to send `/split` to begin again

### Requirement: The QR is for one share and never shows the payee number

The system SHALL send a PayNow QR as a fixed amount that the payer cannot change, with the description when one was given. For an equal split it SHALL send one QR for the share. For a custom split it SHALL send one QR for each distinct amount owed, and each QR's image and caption SHALL name the people who owe that amount. The image and caption SHALL show the description, the amount and, for an equal split, the number of people, and SHALL NOT show the payee number or name. The caption SHALL remind payers to check the payee name in their banking app.

#### Scenario: QR contents

- **WHEN** a bill of 187.40 split by 4 is confirmed with the description `Dinner`
- **THEN** the QR encodes an amount of SGD 46.85 that is not editable and the description `Dinner`, and the caption does not contain the payee number

#### Scenario: QR could not be made

- **WHEN** the QR cannot be generated
- **THEN** the bot says so and asks the user to send `/split` again, without logging the answers

#### Scenario: One QR per distinct amount

- **WHEN** a custom split of Ann 40, Bob 25, Cy 25 is confirmed
- **THEN** the bot sends two QRs: SGD 40.00 labelled Ann, and SGD 25.00 labelled Bob and Cy

#### Scenario: A send fails part way

- **WHEN** Telegram refuses one of several QR sends
- **THEN** the bot stops, says how many QRs were sent and how many were not, and asks the user to send `/split` again
