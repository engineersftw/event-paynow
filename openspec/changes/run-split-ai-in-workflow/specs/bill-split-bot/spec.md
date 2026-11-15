## ADDED Requirements

### Requirement: Receipts and voice notes are read in the background

The system SHALL read a receipt photo or a voice note in a Cloudflare Workflow, outside the background window of the webhook update, so that a slow model does not leave the user without an answer. A read SHALL have a time limit and SHALL be tried again, up to 3 attempts in all, after a failure of the AI call or the file download. A result SHALL only be shown when the conversation is still waiting for it: the owner of the split started it, the conversation is at the same step, and no newer photo or voice note replaced it. A result for a conversation that has moved on or expired SHALL be dropped without a message, and the "Reading your receipt…" or "Listening…" notice SHALL be removed where possible. When the attempts run out, the user SHALL get the same failure message and buttons as for any other failed read. When the Workflow is not available, or an instance cannot be started, the system SHALL read the photo or voice note inline as before.

#### Scenario: A scan that takes long

- **WHEN** the vision model needs 40 seconds to read a receipt
- **THEN** the review is shown when it finishes, and the user is not left with only the "Reading your receipt…" notice

#### Scenario: A temporary model error

- **WHEN** the AI call fails once and succeeds on the next attempt
- **THEN** the user sees the review once, and no failure message

#### Scenario: Attempts run out

- **WHEN** every attempt fails
- **THEN** the notice stays, the bot says the reader failed and offers Send another photo and Type the total instead (a voice note: says voice is not working and asks for typed text), and the failure is counted once

#### Scenario: The conversation moved on

- **WHEN** the organiser cancels the split, or starts another one, while a photo is being read
- **THEN** the result is dropped, nothing is shown, and the notice is removed

#### Scenario: A newer photo replaces an older one

- **WHEN** the organiser sends a second photo before the first is read
- **THEN** only the second photo's result is shown

#### Scenario: Workflow not available

- **WHEN** the Workflow binding is missing or an instance cannot be started
- **THEN** the photo or voice note is read inline, with the same messages as before

## MODIFIED Requirements

### Requirement: The bot stores nothing and is off until configured

The system SHALL keep a split's answers only in the chat's Durable Object until the QR is sent, the user cancels or the conversation expires after 10 minutes of inactivity (one hour while items are being claimed), and SHALL NOT log the bill, payee, description or identities. The only data it keeps beyond that is a QR waiting in the send queue (its QR data, which includes the payee, the amount, the description and the names it is for), which SHALL be removed once it is posted or given up and SHALL NOT be logged, a Workflow instance that reads a photo or voice note (holding only chat, user and message ids, the Telegram file id and a job id), which SHALL NOT hold the photo, the audio, the scan result or the heard text and SHALL NOT be logged, and the anonymous daily counts. It SHALL NOT remember usernames or user ids. The bot's webhook SHALL answer 404 until its token, webhook secret and username are configured, and SHALL reject a request with a wrong secret token.

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

- **WHEN** any split is confirmed
- **THEN** nothing is written to the database except the anonymous daily counts

#### Scenario: A Workflow instance holds no bill data

- **WHEN** a receipt photo or voice note is read in the background
- **THEN** the Workflow's parameters and step results contain no photo, audio, items, prices, heard text or assignment lines

### Requirement: Receipt photos are not kept

The system SHALL process a receipt photo in memory, SHALL NOT store the photo, and SHALL NOT log its contents. The photo SHALL NOT be passed through a Workflow or Queue message: only its Telegram file id is. The items, prices, claims and assignment SHALL be kept only in the chat's conversation state, which is discarded when the split ends, after 10 minutes of inactivity, or after one hour of inactivity while items are being claimed.

#### Scenario: Nothing written

- **WHEN** a receipt split is confirmed
- **THEN** no receipt data remains in the database and the conversation state is cleared

#### Scenario: Conversation expires

- **WHEN** a receipt split has been idle for 10 minutes outside the claiming step
- **THEN** the scan result and assignment are discarded

#### Scenario: The photo is not in the Workflow

- **WHEN** a receipt photo is read in the background
- **THEN** the Workflow instance holds the Telegram file id and the photo is downloaded inside the step that reads it

### Requirement: Voice notes are limited and never kept

The system SHALL refuse a voice note longer than 60 seconds or larger than 1 MB with a message that says so, SHALL hold the audio in memory only for the one request, and SHALL NOT store or log the audio or the heard text, nor pass them through a Workflow or Queue message (only the Telegram file id is). The made lines SHALL live only in the conversation state until used, replaced or the conversation ends.

#### Scenario: Too long

- **WHEN** the organiser sends a voice note of 90 seconds at the assignment step
- **THEN** the bot says voice notes can be at most 60 seconds, applies nothing, and keeps asking for the assignment

#### Scenario: Nothing is kept

- **WHEN** a voice note was heard and the assignment is finished or cancelled
- **THEN** neither the audio nor the heard text remains stored anywhere

#### Scenario: The audio is not in the Workflow

- **WHEN** a voice note is read in the background
- **THEN** the Workflow instance holds the Telegram file id, and the audio is downloaded inside the step that reads it
