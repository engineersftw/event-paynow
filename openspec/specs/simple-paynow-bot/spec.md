# simple-paynow-bot Specification

## Purpose

A standalone Telegram bot that turns a payee, an optional amount and an optional description into a PayNow QR code image, and keeps no record of it.

## Requirements

### Requirement: The bot asks for payee, amount and description

The system SHALL, when a user sends `/start` in a private chat with Simple_PayNow_Bot, ask in order for the payee (a Singapore mobile number or a UEN), then the amount, then a short description. The payee is required. The amount and the description are optional, and each question SHALL offer a Skip button.

#### Scenario: Full conversation

- **WHEN** the user sends `/start`, then a valid payee, an amount `12.50` and the description `Lunch`
- **THEN** the bot replies with a PayNow QR image for that payee, amount and description

#### Scenario: Skipping the optional questions

- **WHEN** the user gives a valid payee and taps Skip on both the amount and the description
- **THEN** the bot replies with a QR image that has no fixed amount and no description

#### Scenario: Invalid payee

- **WHEN** the user's payee is not a valid mobile number or UEN
- **THEN** the bot explains the accepted formats and asks for the payee again, without moving on

#### Scenario: Invalid amount

- **WHEN** the user's amount is not a positive number with at most two decimals
- **THEN** the bot explains the format and asks for the amount again

#### Scenario: Description too long

- **WHEN** the description is longer than 25 characters
- **THEN** the bot says the limit is 25 characters and asks again

### Requirement: The bot asks whether the payer may change a given amount

The system SHALL, when the user gave an amount, ask before the description whether the payer may change the amount payable, with Yes and No buttons. When the amount was skipped, this question SHALL NOT be asked.

#### Scenario: Payer may change the amount

- **WHEN** the user gave an amount and answered Yes to "Can the payer change the amount?"
- **THEN** the QR carries the amount as the starting value and marks it editable

#### Scenario: Payer may not change the amount

- **WHEN** the user gave an amount and answered No
- **THEN** the QR carries the amount as fixed

#### Scenario: Amount skipped

- **WHEN** the user skipped the amount
- **THEN** the "Can the payer change the amount?" question is not asked

### Requirement: The QR leaves the amount to the payer when none is given

The system SHALL build the QR as a PayNow payload for the given payee. With an amount, the amount SHALL be in the QR and SHALL be fixed unless the user said the payer may change it, in which case the QR SHALL show the amount as the starting value and let the payer edit it. Without an amount, the QR SHALL let the payer key in the amount. A description, when given, SHALL be carried in the QR.

#### Scenario: Amount fixed

- **WHEN** the user supplied an amount and said the payer may not change it
- **THEN** scanning the QR in a banking app shows that amount and does not allow editing it

#### Scenario: Amount editable with a starting value

- **WHEN** the user supplied an amount and said the payer may change it
- **THEN** the QR marks the amount as editable and still carries the amount

#### Scenario: Amount left to the payer

- **WHEN** the user skipped the amount
- **THEN** the QR marks the amount as editable so the payer enters it

### Requirement: The QR message never shows the payee number

The system SHALL send the QR as an image with a caption that shows the description and the amount (or "amount set by payer"), and SHALL NOT print the payee's mobile number or UEN in the image or caption, because the message is meant to be forwarded.

#### Scenario: Caption content

- **WHEN** the QR is sent for payee `+6591234567`, amount 12.50, description `Lunch`
- **THEN** the caption mentions `Lunch` and `12.50` and does not contain `91234567`

#### Scenario: Caption when the payer may change the amount

- **WHEN** the amount is editable
- **THEN** the caption says the amount can be changed by the payer

### Requirement: Nothing is stored

The system SHALL NOT write payee numbers, amounts, descriptions or generated QR codes to the database or to logs. The answers of an unfinished conversation SHALL be held only in the per-chat conversation state, which SHALL expire after 10 minutes of inactivity and SHALL be cleared when the QR is sent or the user cancels.

#### Scenario: After the QR is sent

- **WHEN** the QR has been sent
- **THEN** the conversation state holds none of the answers and no database row was written

#### Scenario: Abandoned conversation

- **WHEN** the user stops answering for 10 minutes
- **THEN** the state is cleared and the next `/start` begins fresh

### Requirement: The bot works only in private chats

The system SHALL run the conversation only in private chats. In a group, the bot SHALL reply to `/start` with a short note asking the user to message the bot directly, and SHALL ignore other group messages.

#### Scenario: Group chat

- **WHEN** a user sends `/start` in a group that contains the bot
- **THEN** the bot asks them to open a private chat and does not ask for a payee

### Requirement: Users can cancel and get help

The system SHALL let the user send `/cancel` at any step to abandon the conversation, and `/help` to see what the bot does and how to start.

#### Scenario: Cancel

- **WHEN** the user sends `/cancel` after giving the payee
- **THEN** the conversation is cleared and nothing is generated

### Requirement: The two bots do not interfere

The system SHALL answer Simple_PayNow_Bot only on its own webhook route and SHALL validate that route's own secret. Its conversation state SHALL be kept apart from Event PayNow Bot's, so one user using both bots in their private chats never sees one bot's questions answered by the other.

#### Scenario: Wrong or missing secret

- **WHEN** a request to `/webhook/simple` lacks the correct secret token
- **THEN** it is rejected with 403 and no bot is created

#### Scenario: Both bots in use

- **WHEN** a user is halfway through `/start` in Simple_PayNow_Bot and sends `/start` to Event PayNow Bot
- **THEN** each bot continues its own conversation independently
