## ADDED Requirements

### Requirement: A button of a request that is no longer open says so and stops being tappable

The system SHALL, when a button of a request is tapped and no request is open in that chat (it finished, was cancelled or timed out), answer with a popup that stays until it is dismissed, saying that the request is no longer open, how long a waiting request is kept and to send /start to make a new QR, and SHALL remove the buttons from the message that was tapped. A button of a request that is still open but has moved on SHALL keep the short notice that the step is over.

#### Scenario: Tap after the time ran out

- **WHEN** the user taps Confirm on a summary 20 minutes after their last answer
- **THEN** a popup says the request is no longer open and to send /start, the buttons disappear from that message, and no QR is made

#### Scenario: Tap after the QR was made

- **WHEN** the user taps a button of a request that already finished or was cancelled
- **THEN** they get the same popup and nothing changes

#### Scenario: Still open at another step

- **WHEN** the user taps a button of an earlier step while the request is open at a later one
- **THEN** they get the short notice that the step is over, and the buttons stay

### Requirement: A typed answer with no request open gets a hint

The system SHALL, when a user sends text that is not a command and no request is open, reply once that no QR is being made, to send /start to make one, and how long a waiting request is kept.

#### Scenario: Answer after the time ran out

- **WHEN** a user types the amount 20 minutes after the bot asked for it
- **THEN** the bot replies that no QR is being made and to send /start

#### Scenario: A request is open

- **WHEN** a user sends text while a request is open
- **THEN** it is read as the answer to the current question, as before
