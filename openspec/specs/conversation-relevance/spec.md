# Conversation Relevance Specification

## Purpose

Defines which text messages the bot responds to: only those that belong to an active conversation of the person sending them, so ordinary chat in a group or private chat gets no reply from the bot.

## Requirements

### Requirement: Messages outside a conversation are ignored

The system SHALL NOT reply to, or change any state because of, a text message that is not a command and arrives when the chat has no active conversation, with one exception: in a private chat the system SHALL reply once that nothing is waiting for an answer, to send /help, and how long a waiting conversation is kept. In group chats and topics it SHALL stay silent.

#### Scenario: Ordinary group chat

- **WHEN** a member of a group with the bot sends "see you tomorrow" and no conversation is active
- **THEN** the bot sends no message and records nothing

#### Scenario: Private chat

- **WHEN** a user sends plain text to the bot in a private chat with no conversation active
- **THEN** the bot replies once that nothing is waiting for an answer and to send /help

#### Scenario: Expired conversation

- **WHEN** a conversation has expired from inactivity and the user sends text
- **THEN** in a private chat the bot replies as above, and in a group the bot sends no message

### Requirement: A button of a conversation that is no longer open says so and stops being tappable

The system SHALL, when a button of a conversation (`/init`, `/start`, `/payback`, `/end_event` or `/edit_event`) is tapped and no such conversation is open (it finished, was cancelled or timed out), answer with a popup that stays until it is dismissed, saying that the request is no longer open, how long a waiting conversation is kept and which command to send to start again, and SHALL remove the buttons from the message that was tapped.

#### Scenario: Tap after the time ran out

- **WHEN** an organiser taps Confirm on a `/start` summary 20 minutes after their last answer
- **THEN** a popup says the request is no longer open and to send /start, the buttons disappear from that message, and no payment is created

#### Scenario: Another command

- **WHEN** someone taps a button of an `/init`, `/end_event`, `/edit_event` or `/payback` conversation that is no longer open
- **THEN** they get the popup naming that command, and nothing changes

### Requirement: Buttons that do not belong to a conversation keep working

The system SHALL keep the buttons of the payments list and the actions on a payment (Received, Void, Payback, Sent, Cancel) working from stored data at any time, whatever has happened to any conversation.

#### Scenario: Payment buttons are unaffected

- **WHEN** an admin taps Received on a payment QR long after the conversation that made it ended
- **THEN** the button works as before

### Requirement: Only the conversation's owner continues it

The system SHALL record, when a conversation starts, the user who started it and the topic it started in, and SHALL treat text as part of the conversation only when it comes from that user in that topic. Text from anyone else, or from another topic of the same chat, SHALL be ignored without a reply and without changing the conversation.

#### Scenario: Another member talks mid-flow

- **WHEN** Alice is entering an amount in `/start` and Bob sends "ok" in the same chat
- **THEN** the bot ignores Bob's message and Alice's conversation is unchanged

#### Scenario: Another topic

- **WHEN** the owner sends text in a different topic of the same group while the conversation is active
- **THEN** the bot ignores it

#### Scenario: Owner continues

- **WHEN** Alice sends the amount in the topic where she started `/start`
- **THEN** the conversation advances as before

#### Scenario: Ownership ends with the conversation

- **WHEN** a conversation completes, is cancelled or expires
- **THEN** its owner is cleared and the next conversation records its own owner

### Requirement: Cancelling affects only your own conversation

The system SHALL let `/cancel` reset only an active conversation owned by the sender, and SHALL reply that it was cancelled in that case. In any other case (no conversation, or another user's conversation) `/cancel` SHALL be ignored without a reply.

#### Scenario: Owner cancels

- **WHEN** Alice sends `/cancel` during her `/init`
- **THEN** the conversation is reset and the bot confirms the cancellation

#### Scenario: Someone else cancels

- **WHEN** Bob sends `/cancel` while Alice's conversation is active
- **THEN** nothing happens and Alice's conversation continues

#### Scenario: Nothing to cancel

- **WHEN** a user sends `/cancel` with no active conversation
- **THEN** the bot sends no message

### Requirement: Commands and buttons are unaffected

The system SHALL continue to answer commands (`/start`, `/payments`, `/init`, `/payback`, `/web_admin`, `/end_event`, `/help`, `/ping`) and inline-button taps exactly as before, regardless of who owns any active conversation.

#### Scenario: Help while someone else is mid-flow

- **WHEN** Bob sends `/help` while Alice's conversation is active
- **THEN** the bot sends the help text and Alice's conversation is unchanged
