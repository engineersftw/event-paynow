# Spec Delta

## Purpose

Lets authorized users see how the bots are used, through a `/stats` report in Telegram and anonymous daily counters for the bot that stores nothing else.

## ADDED Requirements

### Requirement: Only authorized users can read the usage report

The system SHALL answer `/stats` in Event PayNow Bot only when the sender's Telegram user id is on the configured list of authorized ids (comma-separated, spaces allowed, entries that are not whole numbers ignored) and the chat is private. It SHALL NOT reply to anyone else, SHALL NOT answer in groups, and SHALL NOT list the command in `/help` or the BotFather command list. When the list is missing or empty, the command SHALL do nothing.

#### Scenario: Authorized user in a private chat

- **WHEN** a user on the list sends `/stats` in a private chat with the bot
- **THEN** the bot replies with the usage report

#### Scenario: Several authorized users

- **WHEN** the list is `111, 222,abc,333`
- **THEN** users 111, 222 and 333 may use `/stats`, and the entry `abc` is ignored

#### Scenario: Someone not on the list

- **WHEN** any user whose id is not on the list sends `/stats`
- **THEN** the bot sends no reply

#### Scenario: In a group

- **WHEN** an authorized user sends `/stats` in a group
- **THEN** the bot does not show the report there

#### Scenario: No list configured

- **WHEN** the list is not set or is empty
- **THEN** `/stats` gets no reply from anyone

### Requirement: The report summarises events and payment requests

The report SHALL show, for Event PayNow Bot: the number of events (total, open, closed, created in the last 7 and 30 days) and of different chats that created one; and the number of payment requests (QR codes) in total, in the last 7 and 30 days, by status, and how many came from the public payment page without sign-in. All of it SHALL be computed from existing records.

#### Scenario: Numbers match the records

- **WHEN** the database holds 3 events (1 closed), 5 payment requests (2 received, 1 voided, 1 from the public page) and 1 check-in
- **THEN** the report shows 3 events with 2 open and 1 closed, 5 payment requests with those statuses and 1 from the public page, and 1 check-in

#### Scenario: Time windows

- **WHEN** some records are older than 30 days
- **THEN** they count in the totals but not in the last-7-day or last-30-day figures

### Requirement: The report shows completed outcomes and no personal data

The report SHALL also show the total SGD received, the number of attendees checked in, and the number of paybacks in total and sent, and SHALL show no names, PayNow numbers or payment references.

#### Scenario: Outcomes

- **WHEN** 2 payments were received for SGD 12.50 each, 1 attendee checked in and 1 payback was sent
- **THEN** the report shows SGD 25.00 received, 1 check-in and 1 sent payback

#### Scenario: No personal data

- **WHEN** the report is shown
- **THEN** it contains no names, PayNow numbers or payment references

### Requirement: Simple_PayNow_Bot's use is counted anonymously by day

The system SHALL, each time Simple_PayNow_Bot sends a QR, add one to the day's count of `simple_qr` and one to exactly one of `simple_amount_skipped` (no amount given), `simple_amount_fixed` (amount given, payer may not change it) or `simple_amount_editable` (amount given, payer may change it). A count SHALL be kept per calendar day in Singapore time and SHALL NOT include any payee, amount, description, user id or chat id. A failure to count SHALL NOT stop the QR from being sent.

#### Scenario: Amount skipped

- **WHEN** a QR is sent without an amount
- **THEN** that day's `simple_qr` and `simple_amount_skipped` counts each go up by one

#### Scenario: Fixed amount

- **WHEN** a QR is sent with an amount the payer may not change
- **THEN** `simple_qr` and `simple_amount_fixed` go up by one

#### Scenario: Editable amount

- **WHEN** a QR is sent with an amount the payer may change
- **THEN** `simple_qr` and `simple_amount_editable` go up by one

#### Scenario: Cancelled or abandoned

- **WHEN** a conversation is cancelled, abandoned or not confirmed
- **THEN** nothing is counted

#### Scenario: Counter failure

- **WHEN** the count cannot be written
- **THEN** the QR is still sent to the user

### Requirement: The report shows how Simple_PayNow_Bot is used

The report SHALL show Simple_PayNow_Bot's QR count in total and for the last 7 and 30 days, and the share of QRs in each amount choice (skipped, fixed, payer can change), computed from the daily counters.

#### Scenario: Amount choices

- **WHEN** 10 QRs were counted, 4 skipped, 3 fixed and 3 editable
- **THEN** the report shows 10 QRs with 40% skipped, 30% fixed and 30% payer can change

#### Scenario: No use yet

- **WHEN** no QR has been counted
- **THEN** the report says so and shows no percentages
