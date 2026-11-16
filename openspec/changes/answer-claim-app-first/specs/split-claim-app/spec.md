## ADDED Requirements

### Requirement: The app is answered before the chat message is updated

The system SHALL answer a change made in the app as soon as the change is recorded, without waiting for the claim message in the chat to be edited. It SHALL then bring that message up to date, and the message SHALL show the newest claims even when several changes come close together or an earlier update finishes late.

#### Scenario: The chat is slow

- **WHEN** the organiser makes a change in the app and Telegram takes several seconds to accept the edit of the claim message
- **THEN** the app shows the new claims at once, and the claim message in the chat shows them when the edit is accepted

#### Scenario: Quick changes

- **WHEN** the organiser makes two changes in the app within the time one edit takes
- **THEN** the claim message ends up showing both changes

#### Scenario: A change from the chat in between

- **WHEN** a member taps an item in the chat while the claim message is being brought up to date after an app change
- **THEN** the claim message ends up showing both the member's claim and the app's change

### Requirement: An update does not start once the claiming has been closed

The system SHALL check, just before it edits the claim message in the chat, that the claiming is still open, and SHALL NOT edit the message when it is not, so that an update that was waiting does not put the claim buttons back on a message the chat has closed.

#### Scenario: Done in the chat first

- **WHEN** the organiser changes an item in the app and taps Done in the chat before the claim message has started to be brought up to date
- **THEN** the message is not edited by the update and stays closed

#### Scenario: Cancelled first

- **WHEN** the split is cancelled before the claim message has started to be brought up to date
- **THEN** the message is not edited
