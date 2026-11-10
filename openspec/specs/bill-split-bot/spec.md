# bill-split-bot Specification

## Purpose

A standalone Telegram bot that splits a bill equally between a number of people and sends a PayNow QR code for one person's share. It keeps no record of the bill.

## Requirements

### Requirement: The bot asks for the bill, the number of people, the payee and a description

The system SHALL, when a user sends `/split` to Split_PayNow_Bot (or `/start` in a private chat), ask in order for the bill total in SGD, the number of people sharing it, the payee (a Singapore mobile number or a UEN) and an optional short description. The total, the number of people and the payee are required. The description SHALL offer a Skip button and SHALL be at most 25 characters. The bot SHALL work in private chats and in group chats.

#### Scenario: Full conversation in a private chat

- **WHEN** the user sends `/split`, the total `187.40`, the number `4`, a valid payee and the description `Dinner`, and then confirms
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

### Requirement: A group's member count is offered as the number of people

The system SHALL, when `/split` runs in a group chat, read the group's member count from Telegram, subtract one for the bot itself, and offer the result as a button on the number-of-people question when it is at least 2. Tapping the button SHALL use that number. The user SHALL always be able to type a different number instead. In a private chat no button is offered.

#### Scenario: Group with six members

- **WHEN** `/split` runs in a group that has the bot and 6 other members
- **THEN** the number-of-people question has a button "Split by 6"

#### Scenario: Typing another number

- **WHEN** the user types `4` instead of tapping the button
- **THEN** the bill is split by 4

#### Scenario: Member count unavailable

- **WHEN** Telegram does not return a member count, or it is below 2
- **THEN** no button is offered and the user types the number

### Requirement: Each person's share is rounded up to the next cent

The system SHALL compute one share as the total in cents divided by the number of people, rounded up to a whole cent, using integer arithmetic. The summary SHALL show the total, the number of people, the share, and, when the shares add up to more than the total, the amount over-collected.

#### Scenario: Even division

- **WHEN** the total is 120.00 and 4 people share it
- **THEN** the share is SGD 30.00 and no over-collection is shown

#### Scenario: Division with a remainder

- **WHEN** the total is 100.00 and 3 people share it
- **THEN** the share is SGD 33.34 and the summary shows that the shares add up to SGD 100.02, which is SGD 0.02 over

### Requirement: The bot confirms before it generates the QR

The system SHALL, after the last question, show one summary with Confirm and Cancel buttons, and SHALL NOT generate the QR until the user confirms. In a private chat the summary shows the payee type and number. In a group chat the summary SHALL show only the payee type and the last four characters of the payee, never the full number.

#### Scenario: Summary in a private chat

- **WHEN** the user has answered every question in a private chat
- **THEN** the bot shows the payee, total, number of people, share and description, and no QR has been sent yet

#### Scenario: Summary in a group

- **WHEN** the user has answered every question in a group chat
- **THEN** the summary hides all but the last four characters of the payee

#### Scenario: Confirm

- **WHEN** the user taps Confirm
- **THEN** the buttons are removed from the summary and the QR is sent exactly once, even if the button is tapped twice

#### Scenario: Cancel

- **WHEN** the user taps Cancel
- **THEN** nothing is generated, the conversation is cleared and the user is told to send `/split` to begin again

### Requirement: The QR is for one share and never shows the payee number

The system SHALL send a PayNow QR for the share as a fixed amount that the payer cannot change, with the description when one was given. The image and its caption SHALL show the description, the share and the number of people, and SHALL NOT show the payee number or name. The caption SHALL remind payers to check the payee name in their banking app.

#### Scenario: QR contents

- **WHEN** a bill of 187.40 split by 4 is confirmed with the description `Dinner`
- **THEN** the QR encodes an amount of SGD 46.85 that is not editable and the description `Dinner`, and the caption does not contain the payee number

#### Scenario: QR could not be made

- **WHEN** the QR cannot be generated
- **THEN** the bot says so and asks the user to send `/split` again, without logging the answers

### Requirement: In a group only the person who started the split can answer

The system SHALL, in a group chat, accept text and button taps for a split only from the user who sent `/split` and only in the same topic. Messages from anyone else SHALL be ignored without a reply, except that a button tap from someone else is answered with a short "not your split" notice. The bot SHALL try to delete the owner's payee message from the group once it has read it, and a failure to delete SHALL NOT stop the conversation.

#### Scenario: Another member replies

- **WHEN** a different group member types a number while a split is waiting for an answer from the owner
- **THEN** the bot ignores it and the split continues unchanged

#### Scenario: Another member taps a button

- **WHEN** a different group member taps Confirm on the summary
- **THEN** nothing is generated and the member sees a notice that the split is not theirs

#### Scenario: Payee message removed

- **WHEN** the owner types the payee in a group where the bot may delete messages
- **THEN** the bot deletes that message

#### Scenario: Cannot delete

- **WHEN** the bot may not delete messages in the group
- **THEN** the conversation continues normally

### Requirement: The bot stores nothing and is off until configured

The system SHALL keep the answers only in the chat's Durable Object under its own key until the QR is sent, the user cancels or the conversation expires after 10 minutes. It SHALL NOT write the bill, the payee, the description or any user identity to the database, and SHALL NOT log them. The bot's webhook SHALL answer 404 until its token, webhook secret and username are configured, and SHALL reject a request with a wrong secret token.

#### Scenario: Not configured

- **WHEN** a request reaches `/webhook/split` and the bot's token or webhook secret is not set
- **THEN** the route answers 404

#### Scenario: Wrong secret

- **WHEN** a request to `/webhook/split` carries a wrong `X-Telegram-Bot-Api-Secret-Token`
- **THEN** the route answers 403 and does not run the bot

#### Scenario: Conversation expires

- **WHEN** a split has been idle for 10 minutes
- **THEN** its answers are discarded and a later reply is ignored

### Requirement: Questions in a group are asked as replies

The system SHALL, in a group chat, ask each text question as a force-reply prompt aimed at the owner, so that the owner's answer reaches the bot while group privacy mode is on. The bot SHALL NOT require group privacy mode to be turned off.

#### Scenario: Owner answers a prompt

- **WHEN** the owner replies to the bot's total question in a group where privacy mode is on
- **THEN** the bot receives the answer and asks the next question
