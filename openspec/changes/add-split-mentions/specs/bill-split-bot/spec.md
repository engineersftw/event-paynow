## ADDED Requirements

### Requirement: A custom list can mention payers

The system SHALL accept, in place of a name in a custom list, an @username (for example `@ann 40`) or a Telegram mention chosen from the member list. A list MAY mix mentions and plain names. A mention counts as the person's name, is unique ignoring case like any name, and SHALL NOT be subject to the 20-character name limit.

#### Scenario: Username mention

- **WHEN** the user sends the lines `@ann 40` and `Bob 25`
- **THEN** the bot accepts a list of two people, the first identified by the username ann

#### Scenario: Mention chosen from the member list

- **WHEN** the user picks a member without a username from Telegram's mention list and gives an amount
- **THEN** the bot accepts the line and identifies the person by their Telegram id

#### Scenario: Same person twice

- **WHEN** the list contains `@Ann 10` and `@ann 20`
- **THEN** the bot rejects the list because the name is repeated

### Requirement: Mentioned people receive their QR by direct message

The system SHALL, when the user confirms a custom split, send each mentioned person who can be messaged a PayNow QR for their own amount as a direct message from the bot. The message SHALL name the organiser, the amount and the description, and SHALL NOT show the payee number. Plain-name people SHALL still be served by one chat QR per distinct amount, and a QR SHALL NOT be sent to the chat for a mentioned person.

#### Scenario: All mentioned and known

- **WHEN** a split of `@ann 40` and `@bob 25` is confirmed and the bot knows both
- **THEN** Ann and Bob each receive a direct message with their own QR and no QR is posted in the chat

#### Scenario: Mixed list

- **WHEN** a split of `@ann 40` and `Cy 25` is confirmed
- **THEN** Ann receives a direct message and the chat receives one QR labelled Cy

#### Scenario: Result report

- **WHEN** the direct messages have been sent
- **THEN** the chat shows which mentioned people were sent their QR and which are waiting

### Requirement: People the bot cannot message get a Get my QR button

The system SHALL, for each mentioned person who cannot be messaged (unknown to the bot, or the message is refused), post one waiting message in the chat with a Get my QR button for each such person. The button SHALL open the bot's private chat. After the person starts the bot there, the bot SHALL check that they are the person mentioned (same Telegram id, or same username ignoring case) and send their QR by direct message. The QR SHALL NOT be posted in the chat.

#### Scenario: Unknown person

- **WHEN** a split names `@dee`, whom the bot does not know, and is confirmed
- **THEN** the chat shows a waiting message with a Get my QR button for Dee

#### Scenario: Dee collects

- **WHEN** Dee taps the button and starts the bot
- **THEN** Dee receives the QR by direct message and the waiting message no longer lists Dee

#### Scenario: Someone else taps

- **WHEN** a different user opens the bot through Dee's button
- **THEN** the bot says the QR is for someone else and sends nothing

### Requirement: Waiting QRs expire and are used once

The system SHALL keep a waiting QR only until it is collected or 48 hours after the split was confirmed, whichever comes first, and SHALL send each waiting QR at most once. An expired or already collected request SHALL be answered with a short notice and no QR.

#### Scenario: Collected twice

- **WHEN** the same person opens their button a second time
- **THEN** the bot says the request is already collected and sends nothing

#### Scenario: Expired

- **WHEN** a person opens a button 49 hours after the split
- **THEN** the bot says the request has expired and sends nothing

### Requirement: The bot remembers who has started it, and can forget them

The system SHALL record a person's Telegram username and user id when they send `/start` to the bot in a private chat, replacing any earlier record for that username or that user. A person with no username SHALL NOT be recorded. `/forget` in a private chat SHALL delete the person's record and reply that it is gone.

#### Scenario: Recorded on start

- **WHEN** a user with the username ann sends `/start` to the bot in a private chat
- **THEN** a later split that mentions @ann can send Ann a direct message

#### Scenario: Username changes hands

- **WHEN** a different user with the username ann sends `/start`
- **THEN** the record for ann now holds the new user's id

#### Scenario: Forget

- **WHEN** the user sends `/forget`
- **THEN** their record is deleted and mentions of them are treated as unknown

## MODIFIED Requirements

### Requirement: A custom split takes a list of names and amounts

The system SHALL accept the custom list as one message with one person per line, each line a name or a mention followed by an amount in SGD (for example `Ann 40` or `@ann 40`), for 1 to 20 people who pay the organiser. The organiser is not listed. If any line is invalid, the system SHALL name the first bad line and ask for the whole list again.

#### Scenario: Valid list

- **WHEN** the bill is 100.00 and the user sends the lines `Ann 40` and `Bob 25.50`
- **THEN** the bot accepts the list of two people

#### Scenario: Bad line

- **WHEN** a line has no amount, a plain name longer than 20 characters, no name, or an amount that is zero, negative or has more than two decimals
- **THEN** the bot names that line, explains the format and asks for the list again

#### Scenario: Duplicate name

- **WHEN** the list contains `Ann 10` and `ann 20`
- **THEN** the bot rejects the list because the name is repeated

#### Scenario: Too many people

- **WHEN** the list has more than 20 lines
- **THEN** the bot says the limit is 20 people and asks again

### Requirement: The bot stores nothing and is off until configured

The system SHALL keep a split's answers only in the chat's Durable Object until the QR is sent, the user cancels or the conversation expires after 10 minutes, and SHALL NOT log the bill, payee, description or identities. The only data it keeps beyond that is the contact record (username and user id, until `/forget`) and a waiting QR (until collected or 48 hours). The bot's webhook SHALL answer 404 until its token, webhook secret and username are configured, and SHALL reject a request with a wrong secret token.

#### Scenario: Not configured

- **WHEN** a request reaches `/webhook/split` and the bot's token or webhook secret is not set
- **THEN** the route answers 404

#### Scenario: Wrong secret

- **WHEN** a request to `/webhook/split` carries a wrong `X-Telegram-Bot-Api-Secret-Token`
- **THEN** the route answers 403 and does not run the bot

#### Scenario: Conversation expires

- **WHEN** a split has been idle for 10 minutes
- **THEN** its answers are discarded and a later reply is ignored

#### Scenario: Nothing kept for an equal split

- **WHEN** an equal split or a custom split with no mentions is confirmed
- **THEN** no contact record or waiting QR is written
