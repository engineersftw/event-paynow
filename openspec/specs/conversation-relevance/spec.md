# Conversation Relevance Specification

## Purpose

Defines which text messages the bot responds to: only those that belong to an active conversation of the person sending them, so ordinary chat in a group or private chat gets no reply from the bot.

## Requirements

### Requirement: Messages outside a conversation are ignored

The system SHALL NOT reply to, or change any state because of, a text message that is not a command and arrives when the chat has no active conversation. This SHALL apply in group chats, topics and private chats alike.

#### Scenario: Ordinary group chat

- **WHEN** a member of a group with the bot sends "see you tomorrow" and no conversation is active
- **THEN** the bot sends no message and records nothing

#### Scenario: Private chat

- **WHEN** a user sends plain text to the bot in a private chat with no conversation active
- **THEN** the bot sends no message

#### Scenario: Expired conversation

- **WHEN** a conversation has expired from inactivity and the user sends text
- **THEN** the bot sends no message

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
