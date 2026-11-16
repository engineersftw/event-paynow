## ADDED Requirements

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

## MODIFIED Requirements

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
