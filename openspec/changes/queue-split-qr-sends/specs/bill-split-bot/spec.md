## ADDED Requirements

### Requirement: QR sends are retried and failures reported

The system SHALL retry a QR that could not be posted: when Telegram asks the bot to slow down it SHALL wait the time Telegram gives, and after another temporary error it SHALL try again after a short delay, up to 5 attempts in all. When Telegram refuses the QR for good (for example the bot was removed from the chat), or the attempts run out, the system SHALL stop trying and, where it still can, post one message in the chat naming the amount and the people whose QR was not sent and asking the user to send `/split` again.

#### Scenario: Slowed down by Telegram

- **WHEN** Telegram answers a QR send with "too many requests, retry after 7 seconds"
- **THEN** the QR is posted again after about 7 seconds and the chat receives it once

#### Scenario: Gives up

- **WHEN** a QR still cannot be posted after 5 attempts
- **THEN** the chat is told which QR (amount and names) was not sent, and no further attempts are made

#### Scenario: Removed from the chat

- **WHEN** the bot was removed from the group after the split was confirmed
- **THEN** the QR is not retried and nothing else is attempted for it

## MODIFIED Requirements

### Requirement: The QR is for one share and never shows the payee number

The system SHALL send a PayNow QR as a fixed amount that the payer cannot change, with the description when one was given. For an equal split it SHALL send one QR for the share. For a custom or receipt split it SHALL post in the chat where the split is confirmed one QR for each distinct amount owed, the organiser's own amount included, and each QR's image and caption SHALL name the people who owe that amount. No QR SHALL be sent by direct message. The image and caption SHALL show the description, the amount and, for an equal split, the number of people, and SHALL NOT show the payee number or name. The caption SHALL remind payers to check the payee name in their banking app.

#### Scenario: QR contents

- **WHEN** a bill of 187.40 split by 4 is confirmed with the description `Dinner`
- **THEN** the QR encodes an amount of SGD 46.85 that is not editable and the description `Dinner`, and the caption does not contain the payee number

#### Scenario: QR could not be made

- **WHEN** the QR cannot be generated
- **THEN** the bot says so and asks the user to send `/split` again, without logging the answers

#### Scenario: One QR per distinct amount

- **WHEN** a custom split of Ann 40, Bob 25, Cy 25 is confirmed
- **THEN** the bot sends two QRs: SGD 40.00 labelled Ann, and SGD 25.00 labelled Bob and Cy

#### Scenario: The organiser is named too

- **WHEN** a custom split of Ann 40 and Bob 25 is confirmed and the organiser's own amount is 25.00
- **THEN** the bot posts two QRs: SGD 40.00 labelled Ann, and SGD 25.00 labelled Bob and the organiser's first name

#### Scenario: A send fails part way

- **WHEN** Telegram refuses one of several QR sends
- **THEN** the other QRs are still sent, the refused one is tried again, and if it still cannot be sent the chat is told which QR is missing and asked to send `/split` again

### Requirement: Every payer's QR is posted in the chat

The system SHALL post every QR of a split in the chat where the split is confirmed, one per distinct amount with the name of everyone who owes it, and SHALL NOT send any QR by direct message. This SHALL hold for plain names, @mentions, people picked from the member list, claimers and the organiser, and for the QRs taken early with Get my QR. Confirming SHALL NOT depend on the bot knowing a person's Telegram identity or being allowed to message them. Each QR SHALL be made and posted separately in the background, so the number of QRs in a split does not limit whether they all arrive; the QRs MAY arrive in any order. A QR that cannot be posted SHALL be retried and, if it still fails, reported in the chat.

#### Scenario: Mentions

- **WHEN** a split of `@ann 40` and `@bob 25` is confirmed
- **THEN** the chat receives a QR for Ann and a QR for Bob, each naming them, and no direct message is sent

#### Scenario: Claimers

- **WHEN** Ann and Bob claimed items and the organiser confirms
- **THEN** their QRs are posted in the chat, except for anyone who already took theirs early

#### Scenario: Already taken

- **WHEN** Ann took her QR early with Get my QR
- **THEN** the bot says in the chat that Ann's QR was already sent and does not post a second one

#### Scenario: Many amounts

- **WHEN** a split with eight distinct amounts is confirmed
- **THEN** all eight QRs are posted in the chat, each naming who it is for, whatever order they arrive in

#### Scenario: Private chat

- **WHEN** the split is run in a private chat with the bot
- **THEN** all the QRs are posted in that chat

### Requirement: A member can get their own QR in the chat before the claiming is closed

The system SHALL show a Get my QR button on the claim message. When a member who holds at least one item taps it, the system SHALL send them a PayNow QR for their own amount to the payee already given, without waiting for the organiser's Done. The amount SHALL be the member's items (each item split equally between its holders) plus their proportional share of the difference between the receipt total and the items, calculated from the receipt's total of all items so that it does not depend on what other members claim, and rounded up to the cent. The QR SHALL be posted in the chat in the background shortly after the tap, with the member's name on the image and caption, and SHALL NOT be sent by direct message; the member's amount SHALL be fixed at the tap. When the QR cannot be posted after retrying, the chat SHALL be told that the member's QR was not sent. A member who holds nothing SHALL be told to claim an item first. The QR SHALL carry the split's description, which is settled before the claiming begins.

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

### Requirement: The bot stores nothing and is off until configured

The system SHALL keep a split's answers only in the chat's Durable Object until the QR is sent, the user cancels or the conversation expires after 10 minutes of inactivity (one hour while items are being claimed), and SHALL NOT log the bill, payee, description or identities. The only data it keeps beyond that is the contact record (username and user id, until `/forget`), a waiting QR (until collected or 48 hours), and a QR waiting in the send queue (its QR data, which includes the payee, the amount, the description and the names it is for), which SHALL be removed once it is posted or given up and SHALL NOT be logged. The bot's webhook SHALL answer 404 until its token, webhook secret and username are configured, and SHALL reject a request with a wrong secret token.

#### Scenario: Not configured

- **WHEN** a request reaches `/webhook/split` and the bot's token or webhook secret is not set
- **THEN** the route answers 404

#### Scenario: Wrong secret

- **WHEN** a request to `/webhook/split` carries a wrong `X-Telegram-Bot-Api-Secret-Token`
- **THEN** the route answers 403 and does not run the bot

#### Scenario: Conversation expires

- **WHEN** a split has been idle for 10 minutes outside the claiming step
- **THEN** its answers are discarded and a later reply is ignored

#### Scenario: Nothing kept for an equal split

- **WHEN** an equal split or a custom split with no mentions is confirmed
- **THEN** no contact record or waiting QR is written
