## ADDED Requirements

### Requirement: Split_PayNow_Bot answers /stats for the same authorized users

The system SHALL answer `/stats` in Split_PayNow_Bot only when the sender's Telegram user id is on the same configured list of authorized ids as Event PayNow Bot and the chat is private. It SHALL NOT reply to anyone else, SHALL NOT answer in groups, SHALL NOT list the command in `/help` or the BotFather command list, and SHALL do nothing when the list is missing or empty.

#### Scenario: Authorized user in a private chat

- **WHEN** a user on the list sends `/stats` to Split_PayNow_Bot in a private chat
- **THEN** the bot replies with the split usage report

#### Scenario: Someone not on the list

- **WHEN** any other user sends `/stats` to Split_PayNow_Bot
- **THEN** the bot sends no reply

#### Scenario: In a group

- **WHEN** an authorized user sends `/stats` in a group
- **THEN** the bot does not show the report there

#### Scenario: No list configured

- **WHEN** the list is not set or is empty
- **THEN** `/stats` gets no reply from anyone

### Requirement: The Split report summarises how the bot is used

The report SHALL show, for Split_PayNow_Bot: the splits confirmed in total and in the last 7 and 30 days, split by type (equal, custom, receipt), by place (private chat, group) and by whether someone else was the payee. It SHALL say when nothing has been counted yet.

#### Scenario: Numbers match what happened

- **WHEN** 3 splits were confirmed (1 equal, 1 custom, 1 receipt), 2 receipt scans were read and 1 failed
- **THEN** the report shows 3 splits split 1, 1 and 1 by type, and 2 scans read, 1 failed

#### Scenario: Time windows

- **WHEN** some splits were confirmed more than 30 days ago
- **THEN** they count in the total but not in the last-7-day or last-30-day figures

#### Scenario: Nothing yet

- **WHEN** no split has been counted
- **THEN** the report says no splits have been counted yet

### Requirement: The Split report shows QR codes, scans and waiting QRs

The report SHALL also show the QR codes sent to the chat and by direct message, the receipt scans read and failed with the success rate, the waiting QRs created and collected and how many are still waiting now, and how many people are remembered for direct messages.

#### Scenario: QR codes

- **WHEN** 4 QR codes went to chats and 3 were sent by direct message
- **THEN** the report shows 4 to the chat and 3 by direct message

#### Scenario: Scans

- **WHEN** 2 receipt scans were read and 1 failed
- **THEN** the report shows 2 read, 1 failed and a success rate of 67%

#### Scenario: Live numbers

- **WHEN** 2 waiting QRs have not been collected or expired and 5 people are remembered
- **THEN** the report shows 2 waiting and 5 people remembered

### Requirement: The Split report shows no personal data

The report SHALL show only numbers and SHALL NOT show names, usernames, user ids, chat ids, PayNow numbers, descriptions or amounts of any split.

#### Scenario: Only numbers

- **WHEN** the report is shown
- **THEN** it contains no name, username, id, PayNow number, description or amount of a split

### Requirement: Split_PayNow_Bot's use is counted anonymously by day

The system SHALL count, per calendar day in Singapore time and in the existing daily counters: each confirmed split by type, by place and, when it applies, by someone else being the payee; each QR sent to the chat and each sent by direct message; each receipt scan read or failed; and each waiting QR created and collected. A count SHALL NOT include any payee, amount, description, name, user id or chat id, and a failure to count SHALL NOT stop the split or the QR from being sent.

#### Scenario: Counting a confirmed split

- **WHEN** a custom split in a group is confirmed
- **THEN** the day's counts for confirmed splits, custom splits and group splits each go up by one

#### Scenario: Counting QRs

- **WHEN** a split sends two QRs to the chat and one by direct message
- **THEN** the day's chat QR count goes up by two and the direct message count by one

#### Scenario: Counting must not break the bot

- **WHEN** writing a count fails
- **THEN** the QR is still sent and the user sees nothing

#### Scenario: Only counters

- **WHEN** a split is confirmed
- **THEN** the only thing recorded for statistics is a day, a metric name and a number
