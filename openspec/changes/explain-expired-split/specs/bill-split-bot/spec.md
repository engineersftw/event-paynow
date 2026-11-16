## ADDED Requirements

### Requirement: A button of a split that is no longer open says so and stops being tappable

The system SHALL, when a button of a split is tapped and no split is open in that chat (it timed out, was cancelled or already finished), answer with a popup that stays until it is dismissed, saying that the split is no longer open, how long a waiting split is kept and to send /split to start a new one, and SHALL remove the buttons from the message that was tapped. A button of a split that is still open but has moved on SHALL keep the short notice that the step is over.

#### Scenario: Tap after the time ran out

- **WHEN** the organiser taps Confirm on a summary 40 minutes after their last answer
- **THEN** a popup says the split is no longer open and to send /split, the buttons disappear from that message, and nothing is created

#### Scenario: Tap after the split finished

- **WHEN** someone taps a button of a split that was already confirmed or cancelled
- **THEN** they get the same popup, and nothing changes

#### Scenario: A member taps an expired claim message

- **WHEN** a member taps an item on a claim message whose claiming timed out
- **THEN** they get the popup and the buttons disappear from the message

#### Scenario: Still open at another step

- **WHEN** someone taps a button of an earlier step while the split is open at a later one
- **THEN** they get the short notice that the step is over, and the buttons stay

### Requirement: A typed answer in a private chat with no split open gets a hint

The system SHALL, when a user sends text in a private chat that is not a command and no split is open, reply once that no split is open, to send /split to start one, and how long a waiting split is kept. In a group the system SHALL stay silent, as for any other chatter.

#### Scenario: Answer after the time ran out

- **WHEN** a user types the bill total in a private chat 40 minutes after the bot asked for it
- **THEN** the bot replies that no split is open and to send /split

#### Scenario: Chatter in a group

- **WHEN** someone sends ordinary text in a group where no split is open
- **THEN** the bot sends no reply

#### Scenario: A split is open

- **WHEN** a user sends text in a private chat while a split is open
- **THEN** it is read as the answer to the current question, as before

## MODIFIED Requirements

### Requirement: The bot stores nothing and is off until configured

The system SHALL keep a split's answers only in the chat's Durable Object until the QR is sent, the user cancels or the conversation expires after 30 minutes of inactivity (one hour while items are being claimed), and SHALL NOT log the bill, payee, description or identities. The only data it keeps beyond that is a QR waiting in the send queue (its QR data, which includes the payee, the amount, the description and the names it is for), which SHALL be removed once it is posted or given up and SHALL NOT be logged, a Workflow instance that reads a photo or voice note (holding only chat, user and message ids, the Telegram file id and a job id), which SHALL NOT hold the photo, the audio, the scan result or the heard text and SHALL NOT be logged, and the anonymous daily counts. It SHALL NOT remember usernames or user ids. The bot's webhook SHALL answer 404 until its token, webhook secret and username are configured, and SHALL reject a request with a wrong secret token.

#### Scenario: Not configured

- **WHEN** a request reaches `/webhook/split` and the bot's token or webhook secret is not set
- **THEN** the route answers 404

#### Scenario: Wrong secret

- **WHEN** a request to `/webhook/split` carries a wrong `X-Telegram-Bot-Api-Secret-Token`
- **THEN** the route answers 403 and does not run the bot

#### Scenario: Conversation expires

- **WHEN** a split has been idle for 30 minutes outside the claiming step
- **THEN** its answers are discarded, a later button tap or private-chat message is told that no split is open, and a later reply in a group is ignored

#### Scenario: Nothing kept for an equal split

- **WHEN** any split is confirmed
- **THEN** nothing is written to the database except the anonymous daily counts

#### Scenario: A Workflow instance holds no bill data

- **WHEN** a receipt photo or voice note is read in the background
- **THEN** the Workflow's parameters and step results contain no photo, audio, items, prices, heard text or assignment lines

### Requirement: Receipt photos are not kept

The system SHALL process a receipt photo in memory, SHALL NOT store the photo, and SHALL NOT log its contents. The photo SHALL NOT be passed through a Workflow or Queue message: only its Telegram file id is. The items, prices, claims and assignment SHALL be kept only in the chat's conversation state, which is discarded when the split ends, after 30 minutes of inactivity, or after one hour of inactivity while items are being claimed.

#### Scenario: Nothing written

- **WHEN** a receipt split is confirmed
- **THEN** no receipt data remains in the database and the conversation state is cleared

#### Scenario: Conversation expires

- **WHEN** a receipt split has been idle for 30 minutes outside the claiming step
- **THEN** the scan result and assignment are discarded

#### Scenario: The photo is not in the Workflow

- **WHEN** a receipt photo is read in the background
- **THEN** the Workflow instance holds the Telegram file id and the photo is downloaded inside the step that reads it
